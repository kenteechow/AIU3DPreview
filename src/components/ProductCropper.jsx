import React, { useState, useRef, useEffect } from 'react';

export default function ProductCropper({ imageSrc, onCrop }) {
  const containerRef = useRef(null);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [region, setRegion] = useState(null);

  const handlePointerDown = (e) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setRegion(null);
  };

  const handlePointerMove = (e) => {
    if (!startPos || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    const y = Math.max(0, Math.min((e.clientY - rect.top) / rect.height, 1));
    setCurrentPos({ x, y });
  };

  const handlePointerUp = () => {
    if (startPos && currentPos) {
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const w = Math.abs(currentPos.x - startPos.x);
      const h = Math.abs(currentPos.y - startPos.y);
      
      if (w > 0.01 && h > 0.01) {
        const newRegion = { x, y, w, h };
        setRegion(newRegion);
        extractImage(newRegion);
      }
    }
    setStartPos(null);
    setCurrentPos(null);
  };

  const extractImage = (r) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const cw = img.width * r.w;
      const ch = img.height * r.h;
      canvas.width = cw;
      canvas.height = ch;
      ctx.drawImage(img, img.width * r.x, img.height * r.y, cw, ch, 0, 0, cw, ch);
      onCrop(canvas.toDataURL('image/png'));
    };
    img.src = imageSrc;
  };

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [startPos, currentPos]);

  const drawBox = startPos && currentPos ? {
    left: `${Math.min(startPos.x, currentPos.x) * 100}%`,
    top: `${Math.min(startPos.y, currentPos.y) * 100}%`,
    width: `${Math.abs(currentPos.x - startPos.x) * 100}%`,
    height: `${Math.abs(currentPos.y - startPos.y) * 100}%`
  } : null;

  const finalBox = region ? {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.w * 100}%`,
    height: `${region.h * 100}%`
  } : null;

  return (
    <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#f8fafc' }}>手動提取產品</h3>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '15px' }}>
        請在展開圖上，用滑鼠按住並拖曳一個框框，把印在上面的「瓶子/產品本身」單獨框選出來。
      </p>

      <div 
        ref={containerRef}
        onPointerDown={handlePointerDown}
        style={{ position: 'relative', width: '100%', userSelect: 'none', touchAction: 'none', cursor: 'crosshair' }}
      >
        <img 
          src={imageSrc} 
          alt="Extract Product" 
          style={{ width: '100%', display: 'block', borderRadius: '4px', opacity: 0.8 }} 
          draggable={false}
        />
        
        {drawBox && (
          <div style={{
            position: 'absolute',
            ...drawBox,
            border: '2px dashed #10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            pointerEvents: 'none'
          }} />
        )}

        {finalBox && !drawBox && (
          <div style={{
            position: 'absolute',
            ...finalBox,
            border: '2px solid #10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            pointerEvents: 'none'
          }}>
            <span style={{ position: 'absolute', top: '-25px', left: 0, background: '#10b981', color: 'white', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px' }}>
              已擷取區域
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
