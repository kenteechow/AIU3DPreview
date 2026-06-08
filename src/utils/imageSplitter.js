import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from 'pdfjs-dist';

// 設置 pdfjs-dist 的 workerSrc 使用 unpkg 避開打包與 cdnjs 未收錄新版的問題
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// 將上傳的 PDF 檔案第一頁渲染成高畫質 Base64 影像（回傳 raw 原始圖與 clean 純淨圖）
export const convertPdfToImage = async (pdfFile) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        // 載入 PDF 文件，配置 cMap 以解決 CJK 中文字型渲染警告
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true
        });
        const pdf = await loadingTask.promise;
        
        // 取得第一頁
        const page = await pdf.getPage(1);
        
        // 設定高解析度 Viewport 比例 (scale = 2.5) 以避免模糊及 AI 識別失敗
        const scale = 2.5;
        const viewport = page.getViewport({ scale });
        
        // 1. 渲染原始版本 (Raw) - 帶有刀模線，用於 2D 對齊定位與手動微調
        const canvasRaw = document.createElement('canvas');
        canvasRaw.width = viewport.width;
        canvasRaw.height = viewport.height;
        const contextRaw = canvasRaw.getContext('2d');
        await page.render({ canvasContext: contextRaw, viewport }).promise;
        const rawBase64 = canvasRaw.toDataURL('image/png');

        // 2. 智慧隱藏「尺寸」、「割線」、「出血」、「折線」圖層，只保留「設計稿圖層」
        let optionalContentConfig = null;
        try {
          const isDielineLayerName = (layerName) => {
            const lower = layerName.toLowerCase().trim();
            // 模糊匹配簡繁體、中英文與常見變體
            const isDimension = lower.includes("尺寸") || lower.includes("dimension") || lower.includes("measure") || lower.includes("尺");
            const isCut = lower.includes("割線") || lower.includes("割") || lower.includes("cut") || lower.includes("trim");
            const isBleed = lower.includes("出血") || lower.includes("bleed");
            const isFold = lower.includes("折線") || lower.includes("折") || lower.includes("fold") || lower.includes("crease");
            const isDieline = lower.includes("刀模") || lower.includes("刀膜") || lower.includes("dieline") || lower.includes("die line") || lower.includes("die-cut");
            
            // 新增 "K線" 和 "刀" 的剔除規則
            const isKLine = lower.includes("k線") || lower.includes("k-line") || lower.includes("k line");
            const isBlade = lower.includes("刀");
            
            return isDimension || isCut || isBleed || isFold || isDieline || isKLine || isBlade;
          };

          optionalContentConfig = await pdf.getOptionalContentConfig();
          console.log("=== 偵測到 PDF 中的選用內容 (OCGs) 圖層列表 ===");
          
          let hasGroups = false;
          // 使用 pdf.js 原生支援的 [Symbol.iterator] 迭代器遍歷 optionalContentConfig 物件本身
          for (const [id, group] of optionalContentConfig) {
            hasGroups = true;
            const name = group.name ? group.name.trim() : "";
            const isDieline = isDielineLayerName(name);
            console.log(`- 圖層 ID: ${id}, 名稱: "${name}", 判定是否為刀模圖層: ${isDieline ? "【是，將主動隱藏】" : "【否，設計稿圖層】"}`);
            if (isDieline) {
              optionalContentConfig.setVisibility(id, false);
            }
          }
          
          if (!hasGroups) {
            console.log("此 PDF 無任何獨立圖層資訊 (可能已扁平化)");
          }
          console.log("=========================================");
        } catch (ocgErr) {
          console.warn("無法取得 PDF 圖層配置或操作圖層可見度，將使用預設渲染:", ocgErr);
        }

        const canvasClean = document.createElement('canvas');
        canvasClean.width = viewport.width;
        canvasClean.height = viewport.height;
        const contextClean = canvasClean.getContext('2d');
        
        const renderContextClean = {
          canvasContext: contextClean,
          viewport: viewport
        };

        if (optionalContentConfig) {
          renderContextClean.optionalContentConfigPromise = Promise.resolve(optionalContentConfig);
        }
        
        await page.render(renderContextClean).promise;
        const cleanBase64 = canvasClean.toDataURL('image/png');
        
        resolve({ raw: rawBase64, clean: cleanBase64 });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(pdfFile);
  });
};

export const cropImageRegions = (imageSrc, regions) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { width, height } = img;
      const tight = {};
      const exportFaces = {};

      Object.keys(regions).forEach(key => {
        const region = regions[key];
        if (!region) {
          tight[key] = null;
          exportFaces[key] = null;
          return;
        }

        // region is expected to have x, y, w, h in normalized coordinates (0 to 1)
        let rx = region.x * width;
        let ry = region.y * height;
        let rw = region.w * width;
        let rh = region.h * height;

        // 10-pixel downward adjustment for perfect horizontal seam alignment
        if (key === 'front' || key === 'back' || key === 'left' || key === 'right') {
          // Shifting both top and bottom horizontal lines down by 10 pixels:
          // Top Y increases by 10px (moves down); Height stays the same (both top and bottom moved down by 10px)
          ry += 10;
        } else if (key === 'top') {
          // Shifting the bottom line of the top panel down by 10 pixels:
          // Bottom edge Y + H increases by 10px, which increases height by 10px
          rh += 10;
        } else if (key === 'bottom') {
          // Shifting the top line of the bottom panel down by 10 pixels:
          // Top edge Y increases by 10px, which decreases height by 10px
          ry += 10;
          rh -= 10;
        }

        // 1. 建立臨時 Canvas 用以載入原始裁切區域，並取得像素以進行刀模線偵測
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = rw;
        tempCanvas.height = rh;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);

        // 智慧型像素掃描：識別邊緣的「尺寸」、「割線」、「出血」、「折線」等 4 個刀模固定圖層並自動向內收縮
        let minX = 0;
        let minY = 0;
        let maxX = rw - 1;
        let maxY = rh - 1;

        const maxShrinkW = Math.floor(rw * 0.15);
        const maxShrinkH = Math.floor(rh * 0.15);

        try {
          const tempData = tempCtx.getImageData(0, 0, rw, rh);
          const pixels = tempData.data;

          const getPixel = (x, y) => {
            const idx = (y * rw + x) * 4;
            return {
              r: pixels[idx],
              g: pixels[idx + 1],
              b: pixels[idx + 2],
              a: pixels[idx + 3]
            };
          };

          const isDielinePixel = (r, g, b, a) => {
            if (a < 50) return false; // 忽略透明像素
            // 1. 啡紅色折線 (Brownish Red)
            const isBrown = r > 90 && r < 230 && g < 130 && b < 130 && r > g * 1.2 && r > b * 1.2;
            // 2. 純紅色割線/出血線 (Pure Red)
            const isRed = r > 180 && g < 70 && b < 70;
            // 3. 純藍色出血線/尺寸線 (Pure Blue)
            const isBlue = b > 180 && r < 70 && g < 70;
            // 4. 綠色折線/出血線 (Green Dieline) - 偵測明亮的綠色線條，放寬黃綠或青綠的相容性
            const isGreen = g > 130 && g > r * 1.4 && g > b * 1.4;
            // 5. 黑色 outer 裁切線 (Black)
            const isBlack = r < 50 && g < 50 && b < 50;

            return isBrown || isRed || isBlue || isGreen || isBlack;
          };

          // 1. 頂部邊界收縮：從 y=0 往下
          for (let y = 0; y < maxShrinkH; y++) {
            let hasDieline = false;
            for (let x = 0; x < rw; x++) {
              const p = getPixel(x, y);
              if (isDielinePixel(p.r, p.g, p.b, p.a)) {
                hasDieline = true;
                break;
              }
            }
            if (hasDieline) {
              minY = y + 1;
            } else {
              break;
            }
          }

          // 2. 底部邊界收縮：從 y=rh-1 往上
          for (let y = rh - 1; y >= rh - 1 - maxShrinkH; y--) {
            let hasDieline = false;
            for (let x = 0; x < rw; x++) {
              const p = getPixel(x, y);
              if (isDielinePixel(p.r, p.g, p.b, p.a)) {
                hasDieline = true;
                break;
              }
            }
            if (hasDieline) {
              maxY = y - 1;
            } else {
              break;
            }
          }

          // 3. 左側邊界收縮：從 x=0 往右
          for (let x = 0; x < maxShrinkW; x++) {
            let hasDieline = false;
            for (let y = 0; y < rh; y++) {
              const p = getPixel(x, y);
              if (isDielinePixel(p.r, p.g, p.b, p.a)) {
                hasDieline = true;
                break;
              }
            }
            if (hasDieline) {
              minX = x + 1;
            } else {
              break;
            }
          }

          // 4. 右側邊界收縮：從 x=rw-1 往左
          for (let x = rw - 1; x >= rw - 1 - maxShrinkW; x--) {
            let hasDieline = false;
            for (let y = 0; y < rh; y++) {
              const p = getPixel(x, y);
              if (isDielinePixel(p.r, p.g, p.b, p.a)) {
                hasDieline = true;
                break;
              }
            }
            if (hasDieline) {
              maxX = x - 1;
            } else {
              break;
            }
          }
        } catch (e) {
          console.warn("刀模邊緣智慧剔除掃描出錯，將退回使用預設裁切界限:", e);
        }

        const finalRw = Math.max(10, maxX - minX + 1);
        const finalRh = Math.max(10, maxY - minY + 1);

        // 2. 產生剔除刀模圖層後的 TIGHT crop 用於 3D 材質貼圖，達到 100% 隱藏刀模效果
        const tightCanvas = document.createElement('canvas');
        tightCanvas.width = finalRw;
        tightCanvas.height = finalRh;
        const tightCtx = tightCanvas.getContext('2d');
        tightCtx.clearRect(0, 0, finalRw, finalRh);
        tightCtx.drawImage(tempCanvas, minX, minY, finalRw, finalRh, 0, 0, finalRw, finalRh);
        tight[key] = tightCanvas.toDataURL('image/png');

        // 3. 產生 1000x1000 置中導出圖檔，較長投影邊限制在 750px 內（即至少 125px 白邊）
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = 1000;
        exportCanvas.height = 1000;
        const exportCtx = exportCanvas.getContext('2d');
        
        // 填充純白背景
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, 1000, 1000);

        const longerEdgeSize = 750; // 限制產品較長邊在 750px 內，四周保證至少 125px 的均勻白邊
        const scale = Math.min(longerEdgeSize / finalRw, longerEdgeSize / finalRh);

        const sw = finalRw * scale;
        const sh = finalRh * scale;
        const dx = (1000 - sw) / 2;
        const dy = (1000 - sh) / 2;

        exportCtx.drawImage(tightCanvas, 0, 0, finalRw, finalRh, dx, dy, sw, sh);
        exportFaces[key] = exportCanvas.toDataURL('image/png');
      });

      resolve({ tight, export: exportFaces });
    };
    img.onerror = (err) => reject(err);
    img.src = imageSrc;
  });
};

// Convert File or Base64 to Gemini API format
const fileToGenerativePart = async (fileOrBase64) => {
  if (typeof fileOrBase64 === 'string') {
    const parts = fileOrBase64.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const data = parts[1];
    return {
      inlineData: {
        data: data,
        mimeType: mime
      }
    };
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({
      inlineData: {
        data: reader.result.split(',')[1],
        mimeType: fileOrBase64.type
      }
    });
    reader.readAsDataURL(fileOrBase64);
  });
};

export const detectFacesWithGemini = async (file, apiKey, shapeType, hasTop = true, hasBottom = true) => {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.5-flash",
      generationConfig: {
        mediaResolution: "MEDIA_RESOLUTION_HIGH"
      }
    });
    const imagePart = await fileToGenerativePart(file);

    const prompt = `
      You are an expert packaging designer and computer vision assistant.
      I have uploaded a 2D die-cut template of a ${shapeType === 'box' ? 'rectangular box' : 'paper bag'}.
      Your task is to detect and return the normalized coordinates (x, y, w, h between 0.0 and 1.0) of each printable panel.
      
      CRITICAL INSTRUCTIONS FOR EXTRACTION & BOUNDARY DETECTION:
      - Extract only valid printed design faces from the uploaded dieline and final flat artwork.
      - Prioritize identifying the printable panel sections and boundary coordinates by tracing the brownish-red (啡紅色) fold and cut lines in the uploaded dieline image.
      - One face per image. Do not combine faces.
      - Do not show dieline lines, fold lines, trim lines, guide marks, or structural lines in the final output.
      - Each image must be exactly 1000x1000 px.
      - Background must be pure white.
      - Center the extracted face and keep at least 100 px white margin on all four sides.
      - Preserve the original panel proportions exactly.
      - Do not adjust, normalize, reinterpret, stretch, warp, distort, redesign, or recompose the proportions of any recognized or extracted Uploaded Materials.
      - Preserve the exact original aspect ratio, panel geometry, and relative layout of each extracted face.
      - Crop each extracted face strictly according to the brown fold/cut boundary lines shown in the uploaded dieline.
      - Use the brown boundary lines as the authoritative panel edges.
      - Do not crop loosely, approximately, or based on the overall artwork area.
      - If the panel has rounded corners, curved edges, tabs, or irregular structural boundaries, follow the actual dieline boundary shape precisely.
      - Keep all text, brand colors, graphics, and layout positions faithful to the original artwork.
      - Exclude glue tabs, blank panels, hidden inner flaps, and non-design areas.
      - If the fold boundaries are ambiguous, unclear, or partially hidden, stop and ask for clarification before generating the final extracted faces.
      
      GEOMETRIC TOPOOLOGY & ALIGNMENT CONSTRAINTS (CRITICAL):
      - Horizontal Alignment & Equal Heights: The four main printable side panels ("front", "back", "left", "right") are always aligned horizontally side-by-side in the 2D template. They MUST have EXACTLY EQUAL Y-coordinates and H-heights in your JSON output. Their top and bottom borders must form straight continuous horizontal lines across the template. Their top boundary Y-coordinate must be aligned exactly with the horizontal fold line separating the sides from the top flap/lid. Do not truncate the top or bottom of the side panels!
      - Top Panel Alignment & True Printable Boundary (CRITICAL): The "top" panel (if active) is physically attached directly above either the "front" or "back" panel. Its X-coordinate and W-width MUST be EXACTLY EQUAL to the X-coordinate and W-width of the panel it attaches to (e.g. if it attaches to "back", its X and W must match the "back" panel). For Y and H coordinates, you MUST strictly capture the entire printed design area of the top lid panel. Its bottom edge Y + H must perfectly align with the top edge Y of the attached side panel. Its top edge Y must cover the entire printed top design up to the upper horizontal fold line of the top lid (only excluding the completely blank/unprinted narrow glue tab or insertion flap at the very top edge if present). Do not over-crop or cut away any of the printed top lid design!
      - Bottom Panel Alignment & Cut Trace (CRITICAL): The "bottom" panel (if active) is physically attached directly below either the "front" or "back" panel. Its X-coordinate and W-width MUST be EXACTLY EQUAL to the X-coordinate and W-width of the panel it attaches to. Its Y-coordinate and H-height MUST cover the entire printed bottom panel design, with its top edge Y aligning perfectly with the bottom edge Y + H of the attached side panel.
      - Glue Tab Joint Exclusion: Exclude the very narrow glue joint tab (usually at the far-left or far-right edge of the template, its width is typically < 3% of the image width). Do not count this tab as part of the "back" or "left" panel width! The left border of your first panel must start exactly where the printable panel begins, ignoring the glue tab.
      DIELINE TRACING & BOUNDARY LIMITS (CRITICAL):
      - Tracing fold lines: The crop borders must cling tightly to the brownish-red fold lines (裁切邊要貼著啡紅色刀模折線走).
      - Do NOT cross black boundaries: Under no circumstances should any crop border cross the black outer boundaries/cut-out lines (但不能越過黑色外框).
      - Final crop limit: When encountering a black boundary line, you MUST use that black boundary line as the absolute final crop limit (遇到黑色邊界時，以黑色邊界作為最終裁切終點).
      - Excess area removal: You must completely cut away and discard any excess or redundant area lying outside the black boundary lines (把超出的多餘區域裁掉).
      
      SEAM ISOLATION & DIELINE EXCLUSION (CRITICAL):
      - Boundary Micro-shrinkage: The normalized bounding boxes (x, y, w, h) you return must be micro-adjusted slightly INWARD (shrink x, y, w, h by approximately 0.2% to 0.5%, or 1-2 pixels) to completely exclude the brownish-red dieline strokes themselves. The cropped area must contain only the inner printed artwork pixels, ensuring seamless 3D corners without dieline borders, dust flap circular arcs, or white gaps leaking at the edges. Do not over-shrink so as not to clip major parts of the printable artwork.
      
      SPECIFIC PANELS TO IDENTIFY:
      For a Box, identify: "front", "back", "left", "right", "top", "bottom".
      For a Bag, identify: "front", "back", "left", "right" (no top, no bottom).
      
      USER PREFERENCES:
      - TOP panel: ${hasTop ? "EXPECTED to have content. Find its precise boundary." : "DOES NOT HAVE CONTENT. You MUST set 'top': null."}
      - BOTTOM panel: ${hasBottom ? "EXPECTED to have content. Find its precise boundary." : "DOES NOT HAVE CONTENT. You MUST set 'bottom': null."}

      Return the bounding boxes in normalized coordinates (x, y, w, h where 0.0 to 1.0 represents the percentage of the image width and height).
      - Precision Constraint: You MUST return all coordinate values (x, y, w, h) rounded precisely to exactly 4 decimal places (精確回傳至小數點後4位，例如 0.2500, 0.3333).
      If a face is blank or does not exist, set its value to null.
      Return ONLY a valid JSON object. Do not include markdown code blocks or any other text.
      
      Example JSON format for box:
      {
        "front": {"x": 0.2500, "y": 0.3300, "w": 0.2500, "h": 0.3300},
        "back": {"x": 0.7500, "y": 0.3300, "w": 0.2500, "h": 0.3300},
        "left": {"x": 0.0000, "y": 0.3300, "w": 0.2500, "h": 0.3300},
        "right": {"x": 0.5000, "y": 0.3300, "w": 0.2500, "h": 0.3300},
        "top": null,
        "bottom": {"x": 0.2500, "y": 0.6600, "w": 0.2500, "h": 0.3300}
      }
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    const match = responseText.match(/\{[\s\S]*\}/);
    const cleanedText = match ? match[0] : responseText;
    const regions = JSON.parse(cleanedText);
    return regions;
  } catch (error) {
    console.error("Gemini Detection Error:", error);
    throw new Error(error.message || "Gemini 3.5 Flash 智慧辨識伺服器請求失敗，請檢查 API Key 或網路連線");
  }
};

export const detectFacesWithGPT = async (file, apiKey, shapeType, hasTop = true, hasBottom = true) => {
  try {
    let base64Data;
    let mimeType = 'image/png';

    if (typeof file === 'string') {
      const parts = file.split(',');
      mimeType = parts[0].match(/:(.*?);/)[1];
      base64Data = parts[1];
    } else {
      base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      mimeType = file.type;
    }

    const prompt = `
      [CRITICAL DIRECTIVE FOR REASONING (MUST FOLLOW)]:
      - LIMIT YOUR INTERNAL REASONING: Do NOT perform long, extensive, or step-by-step logical thinking. Limit your internal reasoning tokens to the absolute minimum (under 200 tokens).
      - QUICK OUTPUT: Calculate the final coordinates quickly and output the final JSON object immediately. Do NOT waste tokens on detailed step-by-step calculations!

      You are an expert packaging designer and computer vision assistant.
      I have uploaded a 2D die-cut template of a ${shapeType === 'box' ? 'rectangular box' : 'paper bag'}.
      Your task is to detect and return the normalized coordinates (x, y, w, h between 0.0 and 1.0) of each printable panel.
      
      CRITICAL INSTRUCTIONS FOR EXTRACTION & BOUNDARY DETECTION:
      - Extract only valid printed design faces from the uploaded dieline and final flat artwork.
      - Prioritize identifying the printable panel sections and boundary coordinates by tracing the brownish-red (啡紅色) fold and cut lines in the uploaded dieline image.
      - One face per image. Do not combine faces.
      - Do not show dieline lines, fold lines, trim lines, guide marks, or structural lines in the final output.
      - Each image must be exactly 1000x1000 px.
      - Background must be pure white.
      - Center the extracted face and keep at least 100 px white margin on all four sides.
      - Preserve the original panel proportions exactly.
      - Do not adjust, normalize, reinterpret, stretch, warp, distort, redesign, or recompose the proportions of any recognized or extracted Uploaded Materials.
      - Preserve the exact original aspect ratio, panel geometry, and relative layout of each extracted face.
      - Crop each extracted face strictly according to the brown fold/cut boundary lines shown in the uploaded dieline.
      - Use the brown boundary lines as the authoritative panel edges.
      - Do not crop loosely, approximately, or based on the overall artwork area.
      - If the panel has rounded corners, curved edges, tabs, or irregular structural boundaries, follow the actual dieline boundary shape precisely.
      - Keep all text, brand colors, graphics, and layout positions faithful to the original artwork.
      - Exclude glue tabs, blank panels, hidden inner flaps, and non-design areas.
      - If the fold boundaries are ambiguous, unclear, or partially hidden, stop and ask for clarification before generating the final extracted faces.
      
      GEOMETRIC TOPOOLOGY & ALIGNMENT CONSTRAINTS (CRITICAL):
      - Horizontal Alignment & Equal Heights: The four main printable side panels ("front", "back", "left", "right") are always aligned horizontally side-by-side in the 2D template. They MUST have EXACTLY EQUAL Y-coordinates and H-heights in your JSON output. Their top and bottom borders must form straight continuous horizontal lines across the template. Their top boundary Y-coordinate must be aligned exactly with the horizontal fold line separating the sides from the top flap/lid. Do not truncate the top or bottom of the side panels!
      - Top Panel Alignment & True Printable Boundary (CRITICAL): The "top" panel (if active) is physically attached directly above either the "front" or "back" panel. Its X-coordinate and W-width MUST be EXACTLY EQUAL to the X-coordinate and W-width of the panel it attaches to (e.g. if it attaches to "back", its X and W must match the "back" panel). For Y and H coordinates, you MUST strictly capture the entire printed design area of the top lid panel. Its bottom edge Y + H must perfectly align with the top edge Y of the attached side panel. Its top edge Y must cover the entire printed top design up to the upper horizontal fold line of the top lid (only excluding the completely blank/unprinted narrow glue tab or insertion flap at the very top edge if present). Do not over-crop or cut away any of the printed top lid design!
      - Bottom Panel Alignment & Cut Trace (CRITICAL): The "bottom" panel (if active) is physically attached directly below either the "front" or "back" panel. Its X-coordinate and W-width MUST be EXACTLY EQUAL to the X-coordinate and W-width of the panel it attaches to. Its Y-coordinate and H-height MUST cover the entire printed bottom panel design, with its top edge Y aligning perfectly with the bottom edge Y + H of the attached side panel.
      - Glue Tab Joint Exclusion: Exclude the very narrow glue joint tab (usually at the far-left or far-right edge of the template, its width is typically < 3% of the image width). Do not count this tab as part of the "back" or "left" panel width! The left border of your first panel must start exactly where the printable panel begins, ignoring the glue tab.
      
      DIELINE TRACING & BOUNDARY LIMITS (CRITICAL):
      - Tracing fold lines: The crop borders must cling tightly to the brownish-red fold lines (裁切邊要貼著啡紅色刀模折線走).
      - Do NOT cross black boundaries: Under no circumstances should any crop border cross the black outer boundaries/cut-out lines (但不能越過黑色外框).
      - Final crop limit: When encountering a black boundary line, you MUST use that black boundary line as the absolute final crop limit (遇到黑色邊界時，以黑色邊界作為最終裁切終點).
      - Excess area removal: You must completely cut away and discard any excess or redundant area lying outside the black boundary lines (把超出的多餘區域裁掉).
      
      SEAM ISOLATION & DIELINE EXCLUSION (CRITICAL):
      - Boundary Micro-shrinkage: The normalized bounding boxes (x, y, w, h) you return must be micro-adjusted slightly INWARD (shrink x, y, w, h by approximately 0.2% to 0.5%, or 1-2 pixels) to completely exclude the brownish-red dieline strokes themselves. The cropped area must contain only the inner printed artwork pixels, ensuring seamless 3D corners without dieline borders, dust flap circular arcs, or white gaps leaking at the edges. Do not over-shrink so as not to clip major parts of the printable artwork.
      
      SPECIFIC PANELS TO IDENTIFY:
      For a Box, identify: "front", "back", "left", "right", "top", "bottom".
      For a Bag, identify: "front", "back", "left", "right" (no top, no bottom).
      
      USER PREFERENCES:
      - TOP panel: ${hasTop ? "EXPECTED to have content. Find its precise boundary." : "DOES NOT HAVE CONTENT. You MUST set 'top': null."}
      - BOTTOM panel: ${hasBottom ? "EXPECTED to have content. Find its precise boundary." : "DOES NOT HAVE CONTENT. You MUST set 'bottom': null."}

      Return the bounding boxes in normalized coordinates (x, y, w, h where 0.0 to 1.0 represents the percentage of the image width and height).
      - Precision Constraint: You MUST return all coordinate values (x, y, w, h) rounded precisely to exactly 4 decimal places (精確回傳至小數點後4位，例如 0.2500, 0.3333).
      If a face is blank or does not exist, set its value to null.
      Return ONLY a valid JSON object. Do not include markdown code blocks or any other text.
      
      Example JSON format for box:
      {
        "front": {"x": 0.2500, "y": 0.3300, "w": 0.2500, "h": 0.3300},
        "back": {"x": 0.7500, "y": 0.3300, "w": 0.2500, "h": 0.3300},
        "left": {"x": 0.0000, "y": 0.3300, "w": 0.2500, "h": 0.3300},
        "right": {"x": 0.5000, "y": 0.3300, "w": 0.2500, "h": 0.3300},
        "top": null,
        "bottom": {"x": 0.2500, "y": 0.6600, "w": 0.2500, "h": 0.3300}
      }
    `;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.5-2026-04-23",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`
                }
              }
            ]
          }
        ],
        max_completion_tokens: 16000
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "OpenAI API returned error status");
    }

    const data = await response.json();
    console.log("GPT Raw Response Data:", data);
    const resultText = data.choices?.[0]?.message?.content?.trim();
    if (!resultText) {
      throw new Error("GPT 辨識伺服器回傳內容為空。完整響應數據為：" + JSON.stringify(data));
    }
    const match = resultText.match(/\{[\s\S]*\}/);
    const cleanedText = match ? match[0] : resultText;
    try {
      const regions = JSON.parse(cleanedText);
      return regions;
    } catch (e) {
      console.error("GPT JSON Parse Failed. Cleaned Text:", cleanedText);
      throw new Error("GPT 回傳格式解析失敗 (" + e.message + ")，請檢查瀏覽器 Console 主控台以查看完整響應");
    }
  } catch (error) {
    console.error("OpenAI GPT Detection Error:", error);
    throw new Error(error.message || "GPT-5.5 智慧辨識伺服器請求失敗，請檢查 API Key 或網路連線");
  }
};

export const removeBackgroundWithGemini = async (imageBase64, mimeType, apiKey) => {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      You are an expert computer vision and image segmentation assistant.
      I have provided an image of a product.
      Your task is to detect the main foreground product subject (e.g., a bottle, package, cup, or product unit) and return a precise, tightly fitting polygon silhouette around the outer boundary of this main product.
      
      CRITICAL INSTRUCTIONS:
      1. ONLY detect the main foreground product. Completely ignore any shadows, background planes, podiums, platforms, decorative plants, or surrounding text.
      2. Return a list of normalized coordinates [{x, y}, {x, y}, ...] representing the outline silhouette.
      3. The points must form a closed loop that wraps perfectly around the product edges.
      4. Use at least 40 to 60 densely spaced points to ensure curved edges and fine corners are smooth and accurate.
      5. Coordinates must be normalized (0.0 to 1.0 represents the percentage of the image width and height).
      6. Return ONLY a valid JSON array of points. Do not include markdown code blocks (e.g. \`\`\`json) or any other explanation.
      
      Example output format:
      [
        {"x": 0.45, "y": 0.10},
        {"x": 0.55, "y": 0.10},
        {"x": 0.60, "y": 0.30},
        ...
      ]
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64.split(',')[1] || imageBase64,
          mimeType: mimeType || "image/png"
        }
      }
    ]);

    const responseText = result.response.text().trim();
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const points = JSON.parse(cleanedText);
    return points;
  } catch (error) {
    console.error("AI Background Removal Error:", error);
    throw error;
  }
};

// Gemini 3.5 Flash 智慧輔助二階微裁切，高精度定位主體產品並完美剔除刀模紅邊
export const aiRefineExportFace = async (tightBase64, key, apiKey) => {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const prompt = `
      You are an expert packaging design computer vision assistant.
      The provided image is a cropped packaging panel (named "${key}") from a template dieline.
      Due to alignment limits, there may be some residual dieline borders along the outer edges of this image.
      These borders belong to dieline layers including "dimension" (尺寸), "cutting line" (割線 - usually red or black), "bleed line" (出血), and "fold line" (折線 - usually brownish-red or green).
      
      Your task is to detect the true printable panel artwork boundary, COMPLETELY EXCLUDING any dieline lines, red/black/blue/green/brownish-red stroke borders at the edges.
      Return the normalized coordinates {"x", "y", "w", "h"} (values between 0.0 and 1.0) of the pure printed design inside these dielines.
      
      CRITICAL INSTRUCTIONS:
      1. Scan all four outer edges. If there are any dieline border strokes (dimension, cut, bleed, or fold lines), exclude them by shrinking the box slightly inward (usually by 1.0% to 3.0% at the borders).
      2. If there are no dieline strokes on a certain edge, do not shrink that edge (keep it at 0.0 or 1.0).
      3. Return ONLY a valid JSON object. Precision must be exactly 4 decimal places. No markdown.
      
      Example output format:
      {"x": 0.0150, "y": 0.0200, "w": 0.9700, "h": 0.9600}
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: tightBase64.split(',')[1] || tightBase64,
          mimeType: "image/png"
        }
      }
    ]);

    const responseText = result.response.text().trim();
    const match = responseText.match(/\{[\s\S]*\}/);
    const cleanedText = match ? match[0] : responseText;
    const box = JSON.parse(cleanedText);
    return box;
  } catch (error) {
    console.error("AI Refine Export Face Error:", error);
    // Fallback: if AI fails, return the full image bounding box
    return { x: 0.0, y: 0.0, w: 1.0, h: 1.0 };
  }
};
