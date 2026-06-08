import React, { useState, useRef, useEffect } from 'react';

export default function GridCropper({ imageSrc, regions, onRegionsChange, hasTop, hasBottom }) {
  const containerRef = useRef(null);
  
  const [vLines, setVLines] = useState([0.05, 0.28, 0.51, 0.74, 0.95]); 
  const [hLines, setHLines] = useState([0.25, 0.75]);
  const [topBorder, setTopBorder] = useState(0.05);
  const [bottomBorder, setBottomBorder] = useState(0.95);
  
  const [topColumn, setTopColumn] = useState(0);
  const [bottomColumn, setBottomColumn] = useState(0);
  
  const [draggingLine, setDraggingLine] = useState(null); 
  const [draggingLabel, setDraggingLabel] = useState(null); 

  // 新增側面順序狀態，支援 D&D 對調
  const [faceOrder, setFaceOrder] = useState(['back', 'left', 'front', 'right']);

  const handleSwapFaces = (source, target) => {
    if (source === target) return;
    const newOrder = [...faceOrder];
    const sourceIdx = newOrder.indexOf(source);
    const targetIdx = newOrder.indexOf(target);
    newOrder[sourceIdx] = target;
    newOrder[targetIdx] = source;
    setFaceOrder(newOrder);
    triggerChange(vLines, hLines, topBorder, bottomBorder, topColumn, bottomColumn, newOrder);
  };

  useEffect(() => {
    if (imageSrc) {
      triggerChange(vLines, hLines, topBorder, bottomBorder, topColumn, bottomColumn);
    }
  }, [imageSrc, hasTop, hasBottom]);

  // 監聽外部 regions 改變（例如 AI 自動辨識完成），反向更新內部的折線位置
  useEffect(() => {
    if (!regions) return;

    // 為了避免手動拖動時與外部狀態產生無限循環更新或抖動，
    // 我們只在外部 regions 與當前線條狀態計算出的 regions 有明顯差異時才進行同步。
    const sortedV = [...vLines].sort((a, b) => a - b);
    const sortedH = [...hLines].sort((a, b) => a - b);

    const currentBackX = sortedV[0] || 0;
    const currentFrontY = sortedH[0] || 0;
    const currentFrontH = (sortedH[1] - sortedH[0]) || 0;

    const targetBack = regions.back || { x: 0 };
    const targetFront = regions.front || { y: 0, h: 0 };

    const diff = Math.abs(currentBackX - targetBack.x) +
                 Math.abs(currentFrontY - targetFront.y) +
                 Math.abs(currentFrontH - targetFront.h);

    // 只有當差異大於一個閾值（例如 0.01），說明是外部全新（AI 辨識）的座標，才進行同步
    if (diff > 0.01) {
      if (regions.back && regions.left && regions.front && regions.right) {
        const newV = [
          regions.back.x,
          regions.left.x,
          regions.front.x,
          regions.right.x,
          regions.right.x + regions.right.w
        ];
        const newH = [
          regions.front.y,
          regions.front.y + regions.front.h
        ];
        setVLines(newV);
        setHLines(newH);

        if (hasTop && regions.top) {
          setTopBorder(regions.top.y);
          // 尋找與 regions.top.x 最接近的垂直線 column 索引
          let tCol = 0;
          let minDiff = Infinity;
          for (let i = 0; i < 4; i++) {
            const d = Math.abs(newV[i] - regions.top.x);
            if (d < minDiff) {
              minDiff = d;
              tCol = i;
            }
          }
          setTopColumn(tCol);
        }

        if (hasBottom && regions.bottom) {
          setBottomBorder(regions.bottom.y + regions.bottom.h);
          // 尋找與 regions.bottom.x 最接近的垂直線 column 索引
          let bCol = 0;
          let minDiff = Infinity;
          for (let i = 0; i < 4; i++) {
            const d = Math.abs(newV[i] - regions.bottom.x);
            if (d < minDiff) {
              minDiff = d;
              bCol = i;
            }
          }
          setBottomColumn(bCol);
        }
      }
    }
  }, [regions, hasTop, hasBottom]);

  const handlePointerDown = (type, index, e) => {
    e.preventDefault();
    setDraggingLine({ type, index });
  };

  const handleLabelPointerDown = (type, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingLabel(type);
  };

  const handlePointerMove = (e) => {
    if (!containerRef.current) return;
    if (!draggingLine && !draggingLabel) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    
    x = Math.max(0, Math.min(x, rect.width));
    y = Math.max(0, Math.min(y, rect.height));
    
    const pctX = x / rect.width;
    const pctY = y / rect.height;

    if (draggingLabel) {
       const sV = [...vLines].sort((a,b)=>a-b);
       let col = 0;
       if (pctX > sV[1] && pctX <= sV[2]) col = 1;
       else if (pctX > sV[2] && pctX <= sV[3]) col = 2;
       else if (pctX > sV[3]) col = 3;
       
       if (draggingLabel === 'top' && topColumn !== col) setTopColumn(col);
       if (draggingLabel === 'bottom' && bottomColumn !== col) setBottomColumn(col);
       return;
    }

    if (draggingLine.type === 'v') {
      const newV = [...vLines];
      newV[draggingLine.index] = pctX;
      setVLines(newV);
    } else if (draggingLine.type === 'h') {
      const newH = [...hLines];
      newH[draggingLine.index] = pctY;
      setHLines(newH);
    } else if (draggingLine.type === 'topBorder') {
      setTopBorder(pctY);
    } else if (draggingLine.type === 'bottomBorder') {
      setBottomBorder(pctY);
    }
  };

  const handlePointerUp = () => {
    if (draggingLine || draggingLabel) {
      triggerChange(vLines, hLines, topBorder, bottomBorder, topColumn, bottomColumn);
      setDraggingLine(null);
      setDraggingLabel(null);
    }
  };

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [draggingLine, draggingLabel, vLines, hLines, topBorder, bottomBorder, topColumn, bottomColumn]);

  const triggerChange = (currentV, currentH, tb, bb, tCol, bCol, currentOrder = faceOrder) => {
    const sortedV = [...currentV].sort((a, b) => a - b);
    const sortedH = [...currentH].sort((a, b) => a - b);
    
    const regions = {
      [currentOrder[0]]: { x: sortedV[0], y: sortedH[0], w: sortedV[1] - sortedV[0], h: sortedH[1] - sortedH[0] },
      [currentOrder[1]]: { x: sortedV[1], y: sortedH[0], w: sortedV[2] - sortedV[1], h: sortedH[1] - sortedH[0] },
      [currentOrder[2]]: { x: sortedV[2], y: sortedH[0], w: sortedV[3] - sortedV[2], h: sortedH[1] - sortedH[0] },
      [currentOrder[3]]: { x: sortedV[3], y: sortedH[0], w: sortedV[4] - sortedV[3], h: sortedH[1] - sortedH[0] },
    };
    
    if (hasTop) {
      regions.top = { x: sortedV[tCol], y: tb, w: sortedV[tCol+1] - sortedV[tCol], h: sortedH[0] - tb };
    } else {
      regions.top = null;
    }
    
    if (hasBottom) {
      regions.bottom = { x: sortedV[bCol], y: sortedH[1], w: sortedV[bCol+1] - sortedV[bCol], h: bb - sortedH[1] };
    } else {
      regions.bottom = null;
    }
    
    onRegionsChange(regions);
  };

  return (
    <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#f8fafc' }}>智慧對齊網格 (請拖曳線條對齊折線)</h3>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '15px' }}>
        請拖曳 <strong>垂直線</strong> 對齊包裝的折線（將左右多餘的糊口排除），拖曳 <strong>水平線</strong> 定義包裝的主要高度。
      </p>

      <div 
        ref={containerRef}
        style={{ position: 'relative', width: '100%', userSelect: 'none', touchAction: 'none' }}
      >
        <img 
          src={imageSrc} 
          alt="Template" 
          style={{ width: '100%', display: 'block', borderRadius: '4px', opacity: 0.8 }} 
          draggable={false}
        />
        
        {/* Render extra Top/Bottom lines */}
        {hasTop && (
          <div 
            onPointerDown={(e) => handlePointerDown('topBorder', 0, e)}
            style={{ position: 'absolute', left: 0, right: 0, top: `${topBorder * 100}%`, height: '4px', marginTop: '-2px', backgroundColor: '#f59e0b', cursor: 'ns-resize', zIndex: 10, boxShadow: '0 0 4px rgba(0,0,0,0.8)' }}
          >
             <div style={{ position: 'absolute', left: '10px', top: '-20px', background: '#f59e0b', color: 'white', fontSize: '10px', padding: '2px 4px', borderRadius: '2px' }}>頂部邊界線</div>
          </div>
        )}
        {hasBottom && (
          <div 
            onPointerDown={(e) => handlePointerDown('bottomBorder', 0, e)}
            style={{ position: 'absolute', left: 0, right: 0, top: `${bottomBorder * 100}%`, height: '4px', marginTop: '-2px', backgroundColor: '#f59e0b', cursor: 'ns-resize', zIndex: 10, boxShadow: '0 0 4px rgba(0,0,0,0.8)' }}
          >
             <div style={{ position: 'absolute', left: '10px', bottom: '-20px', background: '#f59e0b', color: 'white', fontSize: '10px', padding: '2px 4px', borderRadius: '2px' }}>底部邊界線</div>
          </div>
        )}

        {/* Render horizontal lines */}
        {hLines.map((y, idx) => (
          <div 
            key={`h-${idx}`}
            onPointerDown={(e) => handlePointerDown('h', idx, e)}
            style={{ position: 'absolute', left: 0, right: 0, top: `${y * 100}%`, height: '4px', marginTop: '-2px', backgroundColor: '#ef4444', cursor: 'ns-resize', zIndex: 10, boxShadow: '0 0 4px rgba(0,0,0,0.8)' }}
          >
             <div style={{ position: 'absolute', right: '10px', top: '-20px', background: '#ef4444', color: 'white', fontSize: '10px', padding: '2px 4px', borderRadius: '2px' }}>
               水平界線 {idx + 1}
             </div>
          </div>
        ))}

        {/* Render vertical lines */}
        {vLines.map((x, idx) => (
          <div 
            key={`v-${idx}`}
            onPointerDown={(e) => handlePointerDown('v', idx, e)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${x * 100}%`,
              width: '4px',
              marginLeft: '-2px',
              backgroundColor: '#3b82f6',
              cursor: 'ew-resize',
              zIndex: 10,
              boxShadow: '0 0 4px rgba(0,0,0,0.8)'
            }}
          >
             <div style={{ position: 'absolute', left: '-15px', bottom: '-25px', background: '#3b82f6', color: 'white', fontSize: '10px', padding: '2px 4px', borderRadius: '2px', whiteSpace: 'nowrap' }}>
               折線 {idx + 1}
             </div>
          </div>
        ))}

        {/* Labels for regions based on sorted lines */}
        {(() => {
          const sV = [...vLines].sort((a,b)=>a-b);
          const sH = [...hLines].sort((a,b)=>a-b);
          return (
            <>
              {faceOrder.map((faceName, idx) => {
                const label = faceName.charAt(0).toUpperCase() + faceName.slice(1);
                const left = sV[idx] * 100;
                const width = (sV[idx+1] - sV[idx]) * 100;
                const top = sH[0] * 100;
                const height = (sH[1] - sH[0]) * 100;
                return (
                  <div 
                    key={faceName} 
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', faceName);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const source = e.dataTransfer.getData('text/plain');
                      handleSwapFaces(source, faceName);
                    }}
                    style={{
                      position: 'absolute', left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
                      border: '1px dashed rgba(255,255,255,0.4)', background: 'rgba(59, 130, 246, 0.1)',
                      cursor: 'grab',
                      zIndex: 8
                    }}
                  >
                    <span style={{ background: 'rgba(15, 23, 42, 0.85)', color: 'white', padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.8rem', boxShadow: '0 4px 10px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', userSelect: 'none' }}>
                      {label} 🔄
                    </span>
                  </div>
                );
              })}
              
              {/* Top Draggable Label */}
              {hasTop && (
                <div style={{
                  position: 'absolute', left: `${sV[topColumn] * 100}%`, top: `${topBorder * 100}%`, width: `${(sV[topColumn+1] - sV[topColumn]) * 100}%`, height: `${(sH[0] - topBorder) * 100}%`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #f59e0b', background: 'rgba(245, 158, 11, 0.2)', cursor: 'grab', zIndex: 20
                }} onPointerDown={(e) => handleLabelPointerDown('top', e)}>
                  <span style={{ background: '#f59e0b', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', pointerEvents: 'none' }}>Top (可拖曳換列)</span>
                </div>
              )}
              
              {/* Bottom Draggable Label */}
              {hasBottom && (
                <div style={{
                  position: 'absolute', left: `${sV[bottomColumn] * 100}%`, top: `${sH[1] * 100}%`, width: `${(sV[bottomColumn+1] - sV[bottomColumn]) * 100}%`, height: `${(bottomBorder - sH[1]) * 100}%`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #f59e0b', background: 'rgba(245, 158, 11, 0.2)', cursor: 'grab', zIndex: 20
                }} onPointerDown={(e) => handleLabelPointerDown('bottom', e)}>
                  <span style={{ background: '#f59e0b', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', pointerEvents: 'none' }}>Bottom (可拖曳換列)</span>
                </div>
              )}
            </>
          );
        })()}

      </div>
    </div>
  );
}
