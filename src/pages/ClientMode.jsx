import React, { useState, useRef } from 'react';
import { Upload, Download, ArrowLeft, Loader, CheckCircle, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { detectFacesWithGemini, cropImageRegions } from '../utils/imageSplitter';
import Box3D from '../components/Box3D';

export default function ClientMode() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [file, setFile] = useState(null);
  const [faces, setFaces] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [hasTop, setHasTop] = useState(true);
  const [hasBottom, setHasBottom] = useState(true);
  const [dimensions, setDimensions] = useState([2, 2.5, 1.5]);
  const fileInputRef = useRef(null);

  const computeDimensions = (regions, imageSize) => {
    let w = 1, h = 1, d = 1;
    if (regions.front) {
      w = (regions.front.w || 0.25) * imageSize.width;
      h = (regions.front.h || 0.33) * imageSize.height;
    }
    if (regions.left) {
      d = (regions.left.w || 0.25) * imageSize.width;
    }
    const max = Math.max(w, h, d);
    if (max === 0) return [2, 2.5, 1.5];
    const scale = 3.5 / max;
    return [w * scale, h * scale, d * scale];
  };

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    
    if (!apiKey) {
      alert("請先輸入 Google AI Studio API Key 以啟用智能辨識");
      return;
    }

    const fileUrl = URL.createObjectURL(uploadedFile);
    setFile(fileUrl);
    setLoading(true);
    setStatusMsg("上傳中，呼叫 Gemini 2.5 Flash 進行智能邊界辨識...");

    try {
      const img = new Image();
      const imageSize = await new Promise(resolve => {
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.src = fileUrl;
      });

      const regions = await detectFacesWithGemini(uploadedFile, apiKey, 'box', hasTop, hasBottom);
      setStatusMsg("分析完成！過濾粘合部分並裁切中...");
      
      const newDims = computeDimensions(regions, imageSize);
      setDimensions(newDims);

      const regionsToCrop = { ...regions };
      if (!hasTop) regionsToCrop.top = null;
      if (!hasBottom) regionsToCrop.bottom = null;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const resultFaces = await cropImageRegions(event.target.result, regionsToCrop);
        setFaces(resultFaces);
        setLoading(false);
      };
      reader.readAsDataURL(uploadedFile);
    } catch (err) {
      alert("AI 辨識失敗，請確認 API Key 正確或使用設計師模式手動裁切。");
      setLoading(false);
      setFile(null);
    }
  };

  const handleDownload = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = '3D_Render.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: '2rem' }}>
        <ArrowLeft size={18} style={{ marginRight: '8px' }} /> 返回首頁
      </button>

      <div className="glass-panel" style={{ textAlign: 'center' }}>
        <h1 className="heading-gradient" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>一鍵智能生成 (客戶模式)</h1>
        <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>上傳您的平面展開圖，OpenAI 將自動過濾粘合邊，精準辨識並產出真實比例的 3D 效果</p>

        {!file && !loading && (
          <div style={{ maxWidth: '400px', margin: '0 auto 2rem' }}>
             <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '10px 15px', borderRadius: '8px', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
               <Key size={18} color="#94a3b8" style={{ marginRight: '10px' }} />
               <input 
                 type="password" 
                 placeholder="輸入 OpenAI API Key" 
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%' }}
               />
             </div>

             <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '1rem', color: '#cbd5e1', fontSize: '0.9rem' }}>
               <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                 <input type="checkbox" checked={hasTop} onChange={(e) => setHasTop(e.target.checked)} style={{ width: '16px', height: '16px' }}/>
                 頂部包含圖案
               </label>
               <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                 <input type="checkbox" checked={hasBottom} onChange={(e) => setHasBottom(e.target.checked)} style={{ width: '16px', height: '16px' }}/>
                 底部包含圖案
               </label>
             </div>

            <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
              <Upload size={48} color="#3b82f6" style={{ margin: '0 auto 1rem' }} />
              <h3 style={{ marginBottom: '0.5rem' }}>點擊或拖曳上傳圖片</h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem' }}>支援 JPG, PNG 格式</p>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/jpeg, image/png" style={{ display: 'none' }} />
            </div>
          </div>
        )}

        {loading && (
          <div style={{ padding: '4rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Loader size={48} color="#8b5cf6" style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem' }} />
            <h3 style={{ color: '#f8fafc' }}>{statusMsg}</h3>
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {faces && faces.tight && !loading && (
          <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '2rem' }}>
              <CheckCircle size={24} />
              <h3 style={{ margin: 0 }}>生成成功！</h3>
            </div>
            
            <div style={{ height: '500px', borderRadius: '12px', overflow: 'hidden', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '2rem' }}>
              <Box3D faces={faces.tight} dimensions={dimensions} />
            </div>

            <button className="btn-primary" onClick={handleDownload}>
              <Download size={18} /> 下載 3D 渲染圖
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
