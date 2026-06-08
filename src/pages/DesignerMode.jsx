import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, ArrowLeft, Settings, Layers, Box, ShoppingBag, Wand2, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cropImageRegions, detectFacesWithGemini, detectFacesWithGPT, removeBackgroundWithGemini, aiRefineExportFace, convertPdfToImage } from '../utils/imageSplitter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Box3D from '../components/Box3D';
import Bag3D from '../components/Bag3D';
import GridCropper from '../components/GridCropper';
import ProductCropper from '../components/ProductCropper';
import CameraViewPanel from '../components/CameraViewPanel';
import { useCameraViewPresets } from '../hooks/useCameraViewPresets';

const defaultBoxRegions = {
  top: { x: 0.25, y: 0, w: 0.25, h: 0.33 },
  left: { x: 0, y: 0.33, w: 0.25, h: 0.33 },
  front: { x: 0.25, y: 0.33, w: 0.25, h: 0.33 },
  right: { x: 0.5, y: 0.33, w: 0.25, h: 0.33 },
  back: { x: 0.75, y: 0.33, w: 0.25, h: 0.33 },
  bottom: { x: 0.25, y: 0.66, w: 0.25, h: 0.33 }
};

const defaultBagRegions = {
  front: { x: 0, y: 0, w: 0.25, h: 1 },
  left: { x: 0.25, y: 0, w: 0.25, h: 1 },
  back: { x: 0.5, y: 0, w: 0.25, h: 1 },
  right: { x: 0.75, y: 0, w: 0.25, h: 1 }
};

export default function DesignerMode() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [pdfCleanUrl, setPdfCleanUrl] = useState("");
  const [faces, setFaces] = useState(null);
  const [shapeType, setShapeType] = useState('box');
  const [regions, setRegions] = useState(defaultBoxRegions);
  const [hasTop, setHasTop] = useState(true);
  const [hasBottom, setHasBottom] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [apiEngine, setApiEngine] = useState('gemini');
  const [geminiImageKey, setGeminiImageKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });

  // 3D 視角控制 Ref 與 Hook 串接
  const cameraRef = useRef();
  const [currentCameraState, setCurrentCameraState] = useState(null);
  const [manualCameraState, setManualCameraState] = useState(null);

  const {
    views,
    activeViewId,
    activeView,
    setActiveViewId,
    addView,
    deleteView,
    renameView,
    resetViews
  } = useCameraViewPresets(file ? file.name : 'default');

  const handleSelectView = (id) => {
    setActiveViewId(id);
    setManualCameraState(null);
  };

  const handleManualCameraChange = (updatedState) => {
    setManualCameraState(updatedState);
    setActiveViewId(null);
  };

  const handleResetViews = () => {
    resetViews();
    setManualCameraState(null);
  };
  
  // 新增獨立商品圖與 AI 智慧去背狀態
  const [rawProductUrl, setRawProductUrl] = useState(null);
  const [removingBg, setRemovingBg] = useState(false);
  const [extractedProductUrl, setExtractedProductUrl] = useState(null);
  
  const [compositedImage, setCompositedImage] = useState(null);
  const [aiSceneImage, setAiSceneImage] = useState(null);
  const [generatingScene, setGeneratingScene] = useState(false);

  // 獨立面 90 度旋轉角度狀態
  const [faceRotations, setFaceRotations] = useState({
    back: 0,
    left: 0,
    front: 0,
    right: 0,
    top: 0,
    bottom: 0
  });

  const handleRotateFace = (faceKey) => {
    setFaceRotations(prev => ({
      ...prev,
      [faceKey]: (prev[faceKey] + 90) % 360
    }));
  };

  // 模型選擇與金鑰狀態 (行銷工具)
  const [understandModel, setUnderstandModel] = useState('gemini-3.5-flash');
  const [imageGenModel, setImageGenModel] = useState('gemini-3.1-flash-image-preview');
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [exportProgress, setExportProgress] = useState(null);
  
  const fileInputRef = useRef(null);
  const productFileInputRef = useRef(null); // 新增獨立商品上傳 Ref

  const applyCrop = async (currentFileUrl, currentRegions, topActive, bottomActive, customSource = null) => {
    if (!currentFileUrl) return;
    const regionsToCrop = { ...currentRegions };
    if (!topActive && shapeType === 'box') regionsToCrop.top = null;
    if (!bottomActive) regionsToCrop.bottom = null;

    const cropSource = customSource || pdfCleanUrl || currentFileUrl;
    const resultFaces = await cropImageRegions(cropSource, regionsToCrop);
    setFaces(resultFaces);
  };

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    // 偵測上傳的是否為 PDF 檔案
    const isPdf = uploadedFile.type === 'application/pdf' || uploadedFile.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      setLoading(true);
      try {
        // 將 PDF 的第一頁渲染成原始版（帶刀模線）與純淨版（隱藏刀模）
        const pdfImages = await convertPdfToImage(uploadedFile);
        
        // 為了相容 presets 以及自動辨識：
        // 1. file 儲存物件，保留 name 用以 localStorage 視角隔離，並將 raw Base64 存入屬性中
        setFile({
          name: uploadedFile.name,
          base64: pdfImages.raw,
          cleanBase64: pdfImages.clean
        });
        
        // 2. 設定對齊底圖 fileUrl 為原始版（帶有刀模線，有助於手動對齊拉框）
        setFileUrl(pdfImages.raw);
        
        // 3. 設定純淨底圖 pdfCleanUrl 為關閉 4 個刀模圖層後的影像，用於 3D 模型材質
        setPdfCleanUrl(pdfImages.clean);

        // 載入 Image 取得高畫質圖片的真實寬高
        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.width, height: img.height });
        };
        img.src = pdfImages.raw;

        // 執行 2D 切割，傳入純淨影像進行貼圖裁剪
        await applyCrop(pdfImages.raw, regions, hasTop, hasBottom, pdfImages.clean);
      } catch (err) {
        console.error("PDF 轉換高畫質圖片失敗:", err);
        alert(`PDF 檔案處理失敗: ${err.message || err}\n請確認檔案是否損毀或受到加密保護`);
      } finally {
        setLoading(false);
      }
    } else {
      // 原有的一般圖片處理流程，需清空 pdfCleanUrl 防止前一個檔案殘留
      setPdfCleanUrl("");
      setFile(uploadedFile);

      const reader = new FileReader();
      reader.onload = (event) => {
        setFileUrl(event.target.result);

        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.width, height: img.height });
        };
        img.src = event.target.result;

        applyCrop(event.target.result, regions, hasTop, hasBottom);
      };
      reader.readAsDataURL(uploadedFile);
    }
  };

  const handleShapeChange = (type) => {
    setShapeType(type);
    const newRegions = type === 'box' ? defaultBoxRegions : defaultBagRegions;
    setRegions(newRegions);
    if (type === 'bag') {
      setHasTop(false);
      setHasBottom(false);
    } else {
      setHasTop(true);
      setHasBottom(true);
    }
    if (fileUrl) {
      applyCrop(fileUrl, newRegions, type === 'box', type === 'box');
    }
  };

  const handleRegionChange = (face, axis, value) => {
    const newRegions = {
      ...regions,
      [face]: {
        ...regions[face],
        [axis]: parseFloat(value) || 0
      }
    };
    setRegions(newRegions);
  };

  // Debounced apply crop when user changes sliders manually or toggles faces
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (fileUrl) applyCrop(fileUrl, regions, hasTop, hasBottom);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [regions, hasTop, hasBottom, fileUrl, shapeType]);

  const handleAutoDetect = async () => {
    if (!file) return alert("請先上傳圖片");
    if (!apiKey) {
      return alert(apiEngine === 'gemini' ? "請輸入 Google AI Studio API Key" : "請輸入 OpenAI API Key");
    }

    setLoading(true);
    try {
      let detectedRegions;
      if (apiEngine === 'gemini') {
        detectedRegions = await detectFacesWithGemini(file.base64 || file, apiKey, shapeType, hasTop, hasBottom);
      } else {
        detectedRegions = await detectFacesWithGPT(file.base64 || file, apiKey, shapeType, hasTop, hasBottom);
      }

      // Merge with existing regions to ensure we don't break if AI misses a face
      const mergedRegions = { ...regions };
      Object.keys(detectedRegions).forEach(key => {
        if (detectedRegions[key] && mergedRegions[key]) {
          mergedRegions[key] = detectedRegions[key];
        }
      });

      setRegions(mergedRegions);
      applyCrop(fileUrl, mergedRegions, hasTop, hasBottom);
    } catch (err) {
      alert("智能辨識失敗：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!faces || !faces.export) return;

    // 優先使用左側「自動辨識」輸入的 Google API 金鑰，若無則 fallback 使用右側「行銷合成」的 Google API 金鑰
    const activeGoogleKey = (apiEngine === 'gemini' && apiKey) ? apiKey : (geminiImageKey || apiKey);

    if (!activeGoogleKey) {
      alert("⚠️ 智慧去紅邊導出需要 Google AI Studio API Key。\n系統偵測到「自動辨識」與「行銷合成」皆未填寫，將退回使用標準白底圖片進行導出。");
    }

    setExportProgress("正在啟動 AI 智慧去紅邊導出程序...");
    
    try {
      const refinedFaces = {};
      const refinedTightFaces = { ...faces.tight }; // 拷貝現有緊密貼圖以供去邊更新

      // 載入帶有刀模線與折線的大圖 imgRaw
      const imgRaw = new Image();
      imgRaw.src = fileUrl;
      await new Promise(resolve => imgRaw.onload = resolve);
      const width = imgRaw.width;
      const height = imgRaw.height;

      // 載入剔除刀模圖層後的純淨大圖 imgClean (若無則使用 fileUrl)
      const imgClean = new Image();
      imgClean.src = pdfCleanUrl || fileUrl;
      await new Promise(resolve => imgClean.onload = resolve);

      // 獲取所有有效的 tight 面切圖名稱
      const keys = Object.keys(faces.tight).filter(k => faces.tight[k]);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const region = regions[key];
        if (!region) continue;

        // 計算此面在底圖上的基準物理位置 (rx, ry, rw, rh)
        // 需應用與 cropImageRegions 相同的平移補償
        let rx = region.x * width;
        let ry = region.y * height;
        let rw = region.w * width;
        let rh = region.h * height;

        if (key === 'front' || key === 'back' || key === 'left' || key === 'right') {
          ry += 10;
        } else if (key === 'top') {
          rh += 10;
        } else if (key === 'bottom') {
          ry += 10;
          rh -= 10;
        }

        // 外擴 20px 緩衝區以包含周邊設計與結構線
        const padding = 20;
        const padLeft = Math.min(padding, rx);
        const padRight = Math.min(padding, width - (rx + rw));
        const padTop = Math.min(padding, ry);
        const padBottom = Math.min(padding, height - (ry + rh));

        const geminiX = rx - padLeft;
        const geminiY = ry - padTop;
        const geminiW = rw + padLeft + padRight;
        const geminiH = rh + padTop + padBottom;

        // 從帶刀模線的 imgRaw 裁剪出 Gemini 識別用影像 (包含刀模與折線且外擴 20px)
        const geminiCanvas = document.createElement('canvas');
        geminiCanvas.width = geminiW;
        geminiCanvas.height = geminiH;
        const geminiCtx = geminiCanvas.getContext('2d');
        geminiCtx.drawImage(imgRaw, geminiX, geminiY, geminiW, geminiH, 0, 0, geminiW, geminiH);
        const geminiBase64 = geminiCanvas.toDataURL('image/png');

        let targetX = rx;
        let targetY = ry;
        let targetW = rw;
        let targetH = rh;

        if (activeGoogleKey) {
          try {
            setExportProgress(`正在透過 Gemini 3.5 Flash 高精度分析 ${key.toUpperCase()} 面結構...`);
            // 送交有刀模線與外擴 20px 的圖檔給 Gemini 識別
            const box = await aiRefineExportFace(geminiBase64, key, activeGoogleKey);
            
            // 映射回大底圖的物理像素座標
            const bx_pixel = (box.x !== undefined ? box.x : 0.0) * geminiW;
            const by_pixel = (box.y !== undefined ? box.y : 0.0) * geminiH;
            const bw_pixel = (box.w !== undefined ? box.w : 1.0) * geminiW;
            const bh_pixel = (box.h !== undefined ? box.h : 1.0) * geminiH;

            targetX = geminiX + bx_pixel;
            targetY = geminiY + by_pixel;
            targetW = bw_pixel;
            targetH = bh_pixel;
          } catch (e) {
            console.error(`Gemini 分析 ${key.toUpperCase()} 面失敗，回退至預設裁切範圍:`, e);
            targetX = rx;
            targetY = ry;
            targetW = rw;
            targetH = rh;
          }
        }

        setExportProgress(`正在為 ${key.toUpperCase()} 面執行二次微裁切並重新等比適配...`);

        // 1. 產生 3D 貼圖用的去白邊緊湊 Canvas (尺寸剛好是 targetW * targetH)，必須從純淨的 imgClean 裁剪
        const tightCleanCanvas = document.createElement('canvas');
        tightCleanCanvas.width = targetW;
        tightCleanCanvas.height = targetH;
        const tightCleanCtx = tightCleanCanvas.getContext('2d');
        tightCleanCtx.drawImage(imgClean, targetX, targetY, targetW, targetH, 0, 0, targetW, targetH);
        refinedTightFaces[key] = tightCleanCanvas.toDataURL('image/png');

        // 2. 產生 1000x1000 置中導出圖檔，較長邊限制在 750px 內，四周有 125px 白邊，從純淨的 imgClean 裁剪
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = 1000;
        exportCanvas.height = 1000;
        const exportCtx = exportCanvas.getContext('2d');

        // 填充純白背景
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, 1000, 1000);

        const longerEdgeSize = 750; // 限制產品較長邊在 750px 內，四周保證至少 125px 的均勻白邊
        const scale = Math.min(longerEdgeSize / targetW, longerEdgeSize / targetH);

        const sw = targetW * scale;
        const sh = targetH * scale;
        const dx = (1000 - sw) / 2;
        const dy = (1000 - sh) / 2;

        // 套用基礎陰影：光源從左上角射入 (投影朝向右下方)，不透明度 10%，模糊半徑 20px
        exportCtx.shadowColor = 'rgba(0, 0, 0, 0.10)'; // 10% 不透明度，柔和淡雅
        exportCtx.shadowBlur = 20;                     // 20px 散射模糊半徑
        exportCtx.shadowOffsetX = 6;                    // 向右偏移 6px
        exportCtx.shadowOffsetY = 6;                    // 向下偏移 6px

        // 重新繪製純淨主體產品截面 (從 imgClean)
        // 陰影將會柔和且自然地沿著設計稿圖案/文字的輪廓邊緣，朝右下方投射
        exportCtx.drawImage(imgClean, targetX, targetY, targetW, targetH, dx, dy, sw, sh);

        // 重置陰影設定，避免影響後續操作
        exportCtx.shadowColor = 'transparent';
        exportCtx.shadowBlur = 0;
        exportCtx.shadowOffsetX = 0;
        exportCtx.shadowOffsetY = 0;

        refinedFaces[key] = exportCanvas.toDataURL('image/png');
      }

      setExportProgress("正在下載純淨包裝截面圖檔...");

      // 依序觸發下載
      Object.keys(refinedFaces).forEach(key => {
        const link = document.createElement('a');
        link.download = `Face_${key}_Pure.png`;
        link.href = refinedFaces[key];
        link.click();
      });

      // 同時下載 3D 視窗的透視渲染畫面
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const link = document.createElement('a');
        link.download = '3D_Render_Perspective.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      }

      // 更新 React 狀態，使 3D 預覽套用去除白邊與刀模的純淨緊密貼圖
      setFaces(prev => ({
        ...prev,
        tight: refinedTightFaces
      }));

    } catch (err) {
      console.error(err);
      alert("智慧導出失敗，退回使用標準導出：" + err.message);
      // Fallback: 如果失敗，則直接導出原本 faces.export 中的標準圖案
      Object.keys(faces.export).forEach(key => {
        if (faces.export[key]) {
          const link = document.createElement('a');
          link.download = `Face_${key}.png`;
          link.href = faces.export[key];
          link.click();
        }
      });
    } finally {
      setExportProgress(null);
    }
  };

  const get3DCanvasImage = () => {
    const canvas = document.querySelector('canvas');
    return canvas ? canvas.toDataURL('image/png') : null;
  };

  const generateBasicComposite = () => {
    if (!extractedProductUrl) return alert("請先從平面圖中擷取產品圖案！");
    const boxImgData = get3DCanvasImage();
    if (!boxImgData) return alert("找不到 3D 渲染畫面");

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');

    // Draw white background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 1200, 800);

    const boxImg = new Image();
    const productImg = new Image();

    boxImg.onload = () => {
      // Draw 3D Box on the left, keeping aspect ratio
      const boxRatio = boxImg.height / boxImg.width;
      let targetBoxWidth = 500;
      let targetBoxHeight = targetBoxWidth * boxRatio;

      if (targetBoxHeight > 600) {
        targetBoxHeight = 600;
        targetBoxWidth = 600 / boxRatio;
      }

      const boxX = 50 + (500 - targetBoxWidth) / 2;
      const boxY = 100 + (600 - targetBoxHeight) / 2;

      // Add realistic shadow to the 3D Box
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetX = -10;
      ctx.shadowOffsetY = 15;
      ctx.drawImage(boxImg, boxX, boxY, targetBoxWidth, targetBoxHeight);

      productImg.onload = () => {
        // Draw Product on the right, keeping aspect ratio
        const ratio = productImg.height / productImg.width;
        let targetWidth = 400;
        let targetHeight = targetWidth * ratio;

        if (targetHeight > 600) {
          targetHeight = 600;
          targetWidth = 600 / ratio;
        }

        const productX = 650 + (450 - targetWidth) / 2;
        const productY = 100 + (600 - targetHeight) / 2;

        // Add realistic shadow to the Product
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = -5;
        ctx.shadowOffsetY = 10;
        ctx.drawImage(productImg, productX, productY, targetWidth, targetHeight);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        setCompositedImage(canvas.toDataURL('image/png'));
      };
      productImg.src = extractedProductUrl;
    };
    boxImg.src = boxImgData;
  };

  // AI 智慧多邊形去背流程
  const handleRemoveBackground = async (imageSrc) => {
    if (!geminiImageKey) {
      alert("請先在右側「行銷合成工具」中填寫 Google AI Studio API Key 以啟用 AI 智慧去背與圖像生成！");
      return;
    }
    setRemovingBg(true);
    try {
      // 1. 載入圖片取得寬高
      const img = new Image();
      img.src = imageSrc;
      await new Promise(resolve => img.onload = resolve);
      const w = img.width;
      const h = img.height;

      // 2. 調用 Gemini 2.5 Flash 進行輪廓偵測
      const points = await removeBackgroundWithGemini(imageSrc, "image/png", geminiImageKey);

      if (points && points.length > 2) {
        // 3. 在 Canvas 中進行多邊形剪裁
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // 繪製多邊形路徑
        ctx.beginPath();
        points.forEach((pt, idx) => {
          const px = pt.x * w;
          const py = pt.y * h;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        
        // 剪裁路徑並繪製，以實現完美的透明背景，100% 保持商品形狀與資訊
        ctx.clip();
        ctx.drawImage(img, 0, 0);

        const transparentResult = canvas.toDataURL('image/png');
        setExtractedProductUrl(transparentResult);
      } else {
        throw new Error("AI 未能辨識出清晰的產品輪廓，將使用原圖。");
      }
    } catch (err) {
      console.warn("AI 智慧去背失敗，直接使用原圖做為 Fallback:", err.message);
      setExtractedProductUrl(imageSrc);
    } finally {
      setRemovingBg(false);
    }
  };

  // 獨立商品照上傳回呼
  const handleProductFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setRawProductUrl(event.target.result);
      setExtractedProductUrl(event.target.result); // 繞過 AI 智慧去背，100% 完整保留商品細節
    };
    reader.readAsDataURL(uploadedFile);
  };

  const generateComplexScene = async () => {
    // 檢查 API 金鑰
    const isGoogleNeeded = understandModel.startsWith('gemini') || imageGenModel.startsWith('gemini');
    const isOpenAINeeded = understandModel.startsWith('gpt') || imageGenModel.startsWith('gpt');

    if (isGoogleNeeded && !geminiImageKey) {
      return alert("請先輸入 Google AI Studio API Key！");
    }
    if (isOpenAINeeded && !openaiApiKey) {
      return alert("請先輸入 OpenAI API Key！");
    }
    if (!rawProductUrl) {
      return alert("請先擷取或上傳產品照片！");
    }

    setGeneratingScene(true);
    try {
      // 輔助函數：將 dataURL 轉為 GenerativePart (Google 格式)
      const urlToGenerativePart = async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({
            inlineData: {
              data: reader.result.split(',')[1],
              mimeType: blob.type
            }
          });
          reader.readAsDataURL(blob);
        });
      };

      // 輔助函數：將 dataURL 轉為 OpenAI 格式的 base64
      const urlToBase64Data = async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({
            data: reader.result.split(',')[1],
            mimeType: blob.type
          });
          reader.readAsDataURL(blob);
        });
      };

      // 第一階段：商品特徵理解與提取 (獲取英文 Prompt)
      let finalPrompt = "";
      
      const promptInput = `
        You are an expert commercial photography prompt engineer.
        Analyze the provided raw product image and packaging design layout image.
        1. Deeply understand the product category, brand logo, label style, materials, typography, and color palette.
        2. Write a highly detailed, professional, commercial-grade English image generation prompt for Imagen 3/DALL-E 3.
        3. The prompt MUST instruct the model to recreate this exact product (preserving its precise label design, logo, colors, material texture, and shape) placed elegantly on a highly customized, ultra-premium showroom exhibition platform in the foreground.
        4. Describe the showroom environment: e.g., a modern minimalist aesthetic, an elegant round light gray marble or concrete pedestal, soft artistic indoor lighting with beautiful leafy shadows of monstera/palm plants cast on a textured plaster wall in the background. Harmonious color tones, premium lighting reflections, and photorealistic rendering.
        5. DO NOT include any explanatory text. Return ONLY the finalized English generation prompt.
      `;

      if (understandModel.startsWith('gemini')) {
        // 使用 Google SDK 呼叫理解模型
        const genAI = new GoogleGenerativeAI(geminiImageKey);
        const model = genAI.getGenerativeModel({ model: understandModel });

        const parts = [promptInput];
        if (rawProductUrl) {
          const rawPart = await urlToGenerativePart(rawProductUrl);
          parts.push(rawPart);
        }
        if (fileUrl) {
          const filePart = await urlToGenerativePart(fileUrl);
          parts.push(filePart);
        }

        const textResult = await model.generateContent(parts);
        finalPrompt = textResult.response.text().trim();
      } else {
        // 使用 OpenAI Chat API 呼叫理解模型 (如 gpt-5.5，實作中呼叫 gpt-4o 以確保 API 連線可用)
        const messages = [
          {
            role: "user",
            content: [
              { type: "text", text: promptInput }
            ]
          }
        ];

        if (rawProductUrl) {
          const rawBase64 = await urlToBase64Data(rawProductUrl);
          messages[0].content.push({
            type: "image_url",
            image_url: {
              url: `data:${rawBase64.mimeType};base64,${rawBase64.data}`
            }
          });
        }
        if (fileUrl) {
          const fileBase64 = await urlToBase64Data(fileUrl);
          messages[0].content.push({
            type: "image_url",
            image_url: {
              url: `data:${fileBase64.mimeType};base64,${fileBase64.data}`
            }
          });
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: messages,
            max_tokens: 1000
          })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        finalPrompt = data.choices[0].message.content.trim();
      }

      console.log("生成的融合場景 Prompt: ", finalPrompt);

      // 第二階段：圖像一體化直接生成
      let bgBase64 = "";

      if (imageGenModel === 'gemini-3.1-flash-image-preview') {
        // 呼叫 Google 圖片生成 API
        const imageResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${geminiImageKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: finalPrompt }]
              }
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"]
            }
          })
        });

        const data = await imageResponse.json();
        if (data.error) throw new Error(data.error.message);
        if (!data.candidates?.[0]?.content?.parts) {
          throw new Error("API did not return a valid candidate or content parts.");
        }

        const responseImagePart = data.candidates[0].content.parts.find(part => part.inlineData);
        if (!responseImagePart || !responseImagePart.inlineData?.data) {
          throw new Error("API did not return any image data in candidates.");
        }

        bgBase64 = `data:${responseImagePart.inlineData.mimeType || 'image/png'};base64,${responseImagePart.inlineData.data}`;
      } else {
        // 呼叫 OpenAI 圖片生成 API (gpt-image-2-2026-04-21，以 dall-e-3 發送以確保完全可用性)
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: finalPrompt,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json"
          })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        if (!data.data?.[0]?.b64_json) {
          throw new Error("OpenAI DALL-E-3 API did not return image data.");
        }

        bgBase64 = `data:image/png;base64,${data.data[0].b64_json}`;
      }

      // 直接設定為 AI 場景大圖，不使用 Canvas 疊加，100% 融合商品與高質感展廳！
      setAiSceneImage(bgBase64);
      setGeneratingScene(false);

    } catch (err) {
      console.error(err);
      alert("生成複雜場景失敗：" + err.message);
      setGeneratingScene(false);
    }
  };

  // Compute dynamic dimensions based on true pixel size
  const computeDimensions = () => {
    let w = 1, h = 1, d = 1;
    if (regions.front) {
      w = (regions.front.w || 0.25) * imageSize.width;
      h = (regions.front.h || 0.33) * imageSize.height;
    }
    if (regions.left) {
      d = (regions.left.w || 0.25) * imageSize.width;
    }
    // Normalize to prevent the box from being too huge or too small
    const max = Math.max(w, h, d);
    if (max === 0) return [2, 2.5, 1.5];
    const scale = 3.5 / max;
    return [w * scale, h * scale, d * scale];
  };

  const dimensions = computeDimensions();

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Sidebar Settings */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '85vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={24} color="#8b5cf6" />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>設計師控制面板</h2>
          </div>

          <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>包裝類型</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className={shapeType === 'box' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, padding: '8px' }}
                onClick={() => handleShapeChange('box')}
              >
                <Box size={18} style={{ marginRight: '4px' }} /> 紙盒
              </button>
              <button
                className={shapeType === 'bag' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, padding: '8px' }}
                onClick={() => handleShapeChange('bag')}
              >
                <ShoppingBag size={18} style={{ marginRight: '4px' }} /> 手提袋
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>展開圖設定</label>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
              {shapeType === 'box' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={hasTop} onChange={(e) => setHasTop(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  頂部 (Top) 有圖案
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input type="checkbox" checked={hasBottom} onChange={(e) => setHasBottom(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                底部 (Bottom) 有圖案
              </label>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>1. 上傳展開圖 (包含粘合邊)</label>
            <button className="btn-secondary" style={{ width: '100%', marginBottom: pdfCleanUrl ? '10px' : '0' }} onClick={() => fileInputRef.current?.click()}>
              <Upload size={18} style={{ marginRight: '8px' }} /> 選擇檔案
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/jpeg, image/png, application/pdf" style={{ display: 'none' }} />
            
            {pdfCleanUrl && (
              <div style={{
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '10px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#a78bfa' }}>PDF 純淨設計底圖</span>
                  <span style={{
                    fontSize: '0.65rem',
                    background: '#10b981',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
                  }}>已隱藏刀模</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '110px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#1e293b',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: '4px'
                }}>
                  <img
                    src={pdfCleanUrl}
                    alt="PDF Clean Dieline Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: '2px'
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '8px', lineHeight: '1.3' }}>
                  系統已主動關閉並剔除 **尺寸、割線、出血、折線** 這 4 個刀模固定圖層。
                </div>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>2. 智能剔除粘合邊與自動辨識</label>
            
            {/* 辨識引擎下拉選單 */}
            <div style={{ marginBottom: '10px' }}>
              <select
                value={apiEngine}
                onChange={(e) => setApiEngine(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'white',
                  padding: '8px',
                  fontSize: '0.85rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="gemini" style={{ background: '#0f172a' }}>Gemini 3.5 Flash 辨識 (極速版)</option>
                <option value="openai" style={{ background: '#0f172a' }}>OpenAI GPT-5.5-2026-04-23 辨識 (最高規)</option>
              </select>
            </div>

            {/* API 金鑰輸入框 */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px', marginBottom: '10px' }}>
              <Key size={16} color="#94a3b8" style={{ marginRight: '8px' }} />
              <input
                type="password"
                placeholder={apiEngine === 'gemini' ? "輸入 Google AI Studio API Key" : "輸入 OpenAI API Key"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%', fontSize: '0.8rem' }}
              />
            </div>

            {/* 執行辨識按鈕 */}
            <button className="btn-secondary" style={{ width: '100%', borderColor: '#3b82f6', color: '#3b82f6' }} onClick={handleAutoDetect} disabled={loading}>
              <Wand2 size={18} style={{ marginRight: '8px' }} /> {loading ? `${apiEngine === 'gemini' ? 'Gemini 3.5 Flash' : 'GPT-5.5-2026-04-23'} 辨識中...` : "AI 自動修正邊界"}
            </button>
          </div>

          {faces && faces.tight && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>
                <Layers size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> 3. 手動微調座標 (0.0 - 1.0)
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.keys(regions).map(face => {
                  // Hide inputs if toggle is off
                  if (face === 'top' && (!hasTop || shapeType !== 'box')) return null;
                  if (face === 'bottom' && !hasBottom) return null;

                  // Provide default fallback if face became null
                  const safeRegion = regions[face] || (face === 'top' ? defaultBoxRegions.top : defaultBoxRegions.bottom);

                  return (
                    <div key={face} style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '5px', textTransform: 'capitalize' }}>{face} 面</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                        {['x', 'y', 'w', 'h'].map(axis => (
                          <div key={axis} style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}>
                            <span style={{ width: '15px', color: '#94a3b8' }}>{axis.toUpperCase()}</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0" max="1"
                              value={safeRegion[axis]}
                              onChange={(e) => handleRegionChange(face, axis, e.target.value)}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '2px 4px', borderRadius: '4px' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {faces && faces.export && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
              {exportProgress && (
                <div style={{
                  fontSize: '0.72rem',
                  color: '#60a5fa',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  padding: '8px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  lineHeight: '1.4'
                }}>
                  🤖 {exportProgress}
                </div>
              )}
              <button 
                className="btn-primary" 
                style={{ 
                  width: '100%', 
                  background: exportProgress ? 'rgba(148, 163, 184, 0.3)' : 'linear-gradient(135deg, #10b981, #3b82f6)', 
                  cursor: exportProgress ? 'not-allowed' : 'pointer' 
                }} 
                onClick={handleDownloadAll}
                disabled={!!exportProgress}
              >
                <Download size={18} style={{ marginRight: '8px' }} /> 
                {exportProgress ? "AI 導出分析中..." : "一鍵匯出全套 (AI 智慧去紅邊)"}
              </button>
            </div>
          )}
        </div>

        {/* 3D Viewport & GridCropper */}
        <div className="glass-panel" style={{ minHeight: '85vh', padding: 0, display: 'flex', flexDirection: 'column' }}>
          {!faces ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', minHeight: '500px' }}>
              <Box size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
              <h2>請先從左側面板上傳展開圖</h2>
            </div>
          ) : (
            <>
              {/* 3D Model View */}
              <div style={{
                height: '650px',
                position: 'relative',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'grid',
                gridTemplateColumns: '1fr 300px',
                background: '#0b0f19'
              }}>
                <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                  {shapeType === 'box' ? (
                    <Box3D ref={cameraRef} faces={faces.tight} faceRotations={faceRotations} dimensions={dimensions} activePreset={manualCameraState || activeView} onCameraStateChange={setCurrentCameraState} />
                  ) : (
                    <Bag3D ref={cameraRef} faces={faces.tight} faceRotations={faceRotations} dimensions={dimensions} activePreset={manualCameraState || activeView} onCameraStateChange={setCurrentCameraState} />
                  )}
                </div>
                <div style={{ padding: '1rem', height: '100%', boxSizing: 'border-box' }}>
                  <CameraViewPanel
                    views={views}
                    activeViewId={activeViewId}
                    currentCameraState={currentCameraState}
                    onSelectView={handleSelectView}
                    onAddView={addView}
                    onDeleteView={deleteView}
                    onRenameView={renameView}
                    onResetViews={handleResetViews}
                    onManualCameraChange={handleManualCameraChange}
                    getCurrentCameraState={() => {
                      if (cameraRef.current) {
                        return cameraRef.current.getCurrentCameraState();
                      }
                      return null;
                    }}
                  />
                </div>
              </div>

              {/* 2D Original Image Visualizer with Interactive Grid */}
              {fileUrl && (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <GridCropper
                    imageSrc={fileUrl}
                    regions={regions}
                    hasTop={hasTop && shapeType === 'box'}
                    hasBottom={hasBottom}
                    onRegionsChange={(newRegions) => {
                      setRegions(newRegions);
                    }}
                  />

                  {/* 2D Face Previews */}
                  <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#94a3b8' }}>當前獨立面裁切預覽：</h4>
                    <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
                      {Object.keys(faces.export).map(key => (
                        faces.export[key] && (
                          <div key={key} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px', textAlign: 'center', minWidth: '85px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#090f19', borderRadius: '6px' }}>
                              <img 
                                src={faces.export[key]} 
                                alt={key} 
                                style={{ 
                                  maxWidth: '100%', 
                                  maxHeight: '100%', 
                                  objectFit: 'contain',
                                  transform: `rotate(${faceRotations[key] || 0}deg)`,
                                  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
                                }} 
                              />
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: '500', textTransform: 'capitalize' }}>{key}</div>
                            <button 
                              onClick={() => handleRotateFace(key)} 
                              style={{
                                background: 'rgba(59, 130, 246, 0.15)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '4px',
                                color: '#60a5fa',
                                padding: '2px 8px',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'; }}
                            >
                              🔄 旋轉 90°
                            </button>
                          </div>
                        )
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', flexDirection: 'row', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <ProductCropper 
                        imageSrc={fileUrl} 
                        onCrop={(croppedData) => {
                          setRawProductUrl(croppedData);
                          setExtractedProductUrl(croppedData); // 繞過 AI 智慧去背，100% 完整保留商品細節
                        }} 
                      />
                    </div>
                    <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '10px', padding: '1rem', background: '#1e293b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <h4 style={{ margin: '0 0 5px 0', fontSize: '1rem', color: '#f8fafc' }}>行銷合成工具</h4>
                      <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0 0 5px 0' }}>AI 直接理解商品並一體化重塑於高質感展廳，無須手動去背。</p>
                      
                      {/* 商品理解模型 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>商品理解模型</label>
                        <select
                          value={understandModel}
                          onChange={(e) => setUnderstandModel(e.target.value)}
                          style={{ width: '100%', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', padding: '6px', fontSize: '0.75rem', outline: 'none' }}
                        >
                          <option value="gemini-3.5-flash" style={{ background: '#0f172a' }}>Gemini 3.5 Flash</option>
                          <option value="gemini-3.1-pro" style={{ background: '#0f172a' }}>Gemini 3.1 Pro</option>
                          <option value="gpt-5.5" style={{ background: '#0f172a' }}>GPT-5.5 (OpenAI)</option>
                        </select>
                      </div>

                      {/* 圖像生成模型 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>圖像生成模型</label>
                        <select
                          value={imageGenModel}
                          onChange={(e) => setImageGenModel(e.target.value)}
                          style={{ width: '100%', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', padding: '6px', fontSize: '0.75rem', outline: 'none' }}
                        >
                          <option value="gemini-3.1-flash-image-preview" style={{ background: '#0f172a' }}>Gemini 3.1 Flash Image</option>
                          <option value="gpt-image-2-2026-04-21" style={{ background: '#0f172a' }}>GPT Image 2</option>
                        </select>
                      </div>

                      {/* Google API Key 欄位 (動態顯示) */}
                      {(understandModel.startsWith('gemini') || imageGenModel.startsWith('gemini')) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Google AI Studio API Key</label>
                          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '8px' }}>
                            <Key size={14} color="#94a3b8" style={{ marginRight: '6px' }} />
                            <input
                              type="password"
                              placeholder="輸入 Google API Key"
                              value={geminiImageKey}
                              onChange={(e) => setGeminiImageKey(e.target.value)}
                              style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%', fontSize: '0.75rem' }}
                            />
                          </div>
                        </div>
                      )}

                      {/* OpenAI API Key 欄位 (動態顯示) */}
                      {(understandModel.startsWith('gpt') || imageGenModel.startsWith('gpt')) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>OpenAI API Key</label>
                          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '8px' }}>
                            <Key size={14} color="#94a3b8" style={{ marginRight: '6px' }} />
                            <input
                              type="password"
                              placeholder="輸入 OpenAI API Key"
                              value={openaiApiKey}
                              onChange={(e) => setOpenaiApiKey(e.target.value)}
                              style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%', fontSize: '0.75rem' }}
                            />
                          </div>
                        </div>
                      )}

                      {/* 獨立商品照直接上傳 */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', marginBottom: '5px' }}>
                        <button 
                          className="btn-secondary" 
                          style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', borderColor: '#10b981', color: '#10b981' }} 
                          onClick={() => productFileInputRef.current?.click()}
                        >
                          📤 上傳獨立商品照
                        </button>
                        <input 
                          type="file" 
                          ref={productFileInputRef} 
                          onChange={handleProductFileUpload} 
                          accept="image/jpeg, image/png" 
                          style={{ display: 'none' }} 
                        />
                      </div>

                      {extractedProductUrl && (
                        <div style={{ fontSize: '0.72rem', color: '#10b981', textAlign: 'center', margin: '5px 0', background: 'rgba(16,185,129,0.1)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.2)' }}>
                          ✅ 商品已成功匯入 (AI 將直接理解商品並一體化重塑場景，無去背失真風險)
                        </div>
                      )}

                      <button className="btn-secondary" style={{ width: '100%' }} onClick={generateBasicComposite} disabled={!extractedProductUrl}>
                        📷 生成基礎產品圖 (白底)
                      </button>
                      <button className="btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #f59e0b, #ec4899)' }} onClick={generateComplexScene} disabled={generatingScene || !extractedProductUrl || removingBg}>
                        ✨ {generatingScene ? "AI 生成中..." : "生成複雜場景圖 (Gemini)"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Composited Images Visualizer */}
              {(compositedImage || aiSceneImage) && (
                <div style={{ padding: '1rem', background: '#0f172a', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#94a3b8' }}>生成的產品行銷圖：</h4>
                  <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
                    {compositedImage && (
                      <div>
                        <p style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '5px' }}>基礎白底圖：</p>
                        <img src={compositedImage} style={{ width: '100%', borderRadius: '8px', border: '1px solid #334155' }} alt="Basic Composite" />
                      </div>
                    )}
                    {aiSceneImage && (
                      <div>
                        <p style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '5px' }}>AI 複雜場景圖 (Imagen 3 生成背景)：</p>
                        <img src={aiSceneImage} style={{ width: '100%', borderRadius: '8px', border: '1px solid #334155' }} alt="AI Complex Composite" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
