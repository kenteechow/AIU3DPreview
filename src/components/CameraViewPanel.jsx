import React, { useState } from 'react';
import { Camera, Trash2, Edit2, RotateCcw, Check, X, Plus } from 'lucide-react';

export default function CameraViewPanel({
  views,
  activeViewId,
  currentCameraState,
  onSelectView,
  onAddView,
  onDeleteView,
  onRenameView,
  onResetViews,
  onManualCameraChange,
  getCurrentCameraState
}) {
  const [isRenamingId, setIsRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  
  const [isAdding, setIsAdding] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // 實時相機狀態與手動輸入綁定
  const [localState, setLocalState] = useState({
    posX: 0, posY: 2, posZ: 5,
    tarX: 0, tarY: 0, tarZ: 0,
    zoom: 1.2
  });

  // 同步外部實時相機屬性
  React.useEffect(() => {
    const activeEl = document.activeElement;
    const isEditing = activeEl && activeEl.dataset.cameraField;
    if (!isEditing && currentCameraState) {
      setLocalState({
        posX: Number(currentCameraState.position.x.toFixed(3)),
        posY: Number(currentCameraState.position.y.toFixed(3)),
        posZ: Number(currentCameraState.position.z.toFixed(3)),
        tarX: Number(currentCameraState.target.x.toFixed(3)),
        tarY: Number(currentCameraState.target.y.toFixed(3)),
        tarZ: Number(currentCameraState.target.z.toFixed(3)),
        zoom: Number(currentCameraState.zoom.toFixed(1))
      });
    }
  }, [currentCameraState]);

  const handleFieldChange = (field, val) => {
    const numVal = parseFloat(val) || 0;
    const updatedLocal = { ...localState, [field]: numVal };
    setLocalState(updatedLocal);

    if (onManualCameraChange) {
      onManualCameraChange({
        position: { x: updatedLocal.posX, y: updatedLocal.posY, z: updatedLocal.posZ },
        target: { x: updatedLocal.tarX, y: updatedLocal.tarY, z: updatedLocal.tarZ },
        zoom: updatedLocal.zoom
      });
    }
  };

  // 處理點擊新增
  const handleAddClick = () => {
    setIsAdding(true);
    setNewViewName('');
  };

  const handleAddSubmit = () => {
    const state = getCurrentCameraState();
    if (!state) {
      alert('請先點擊 3D 視窗以確保攝影機已初始化！');
      return;
    }
    onAddView(newViewName, state);
    setIsAdding(false);
  };

  // 處理重新命名
  const handleRenameStart = (view, e) => {
    e.stopPropagation();
    setIsRenamingId(view.id);
    setRenameValue(view.name);
  };

  const handleRenameSubmit = (id, e) => {
    e.stopPropagation();
    onRenameView(id, renameValue);
    setIsRenamingId(null);
  };

  // 處理刪除
  const handleDeleteClick = (id, e) => {
    e.stopPropagation();
    setConfirmDeleteId(id);
  };

  const handleDeleteConfirm = (id, e) => {
    e.stopPropagation();
    onDeleteView(id);
    setConfirmDeleteId(null);
  };

  return (
    <div style={{
      background: 'rgba(30, 41, 59, 0.75)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      padding: '1.25rem',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      height: '100%',
      overflowY: 'auto',
      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Camera size={20} color="#8b5cf6" />
          <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: '600', letterSpacing: '0.05em' }}>3D 固定視角管理</h3>
        </div>
        <button
          onClick={onResetViews}
          title="恢復預設視角"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '6px 10px',
            color: '#94a3b8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.75rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = '#f8fafc';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          <RotateCcw size={12} />
          重置
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, lineHeight: '1.4' }}>
        選擇固定視角查看模型，或調整 3D 視角後儲存為自訂視角。
      </p>

      {/* View List */}
      <div style={{
        flex: '0 1 auto',
        overflowY: 'auto',
        maxHeight: '160px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        paddingRight: '4px'
      }}>
        {views.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#64748b', fontSize: '0.8rem' }}>
            暫無視角，請重置或手動新增
          </div>
        ) : (
          views.map((view) => {
            const isActive = view.id === activeViewId;
            const isRenaming = view.id === isRenamingId;
            const isConfirming = view.id === confirmDeleteId;

            return (
              <div
                key={view.id}
                onClick={() => !isRenaming && onSelectView(view.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: isActive ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))' : 'rgba(255, 255, 255, 0.02)',
                  border: isActive ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: isRenaming ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
              >
                {/* Left side: Icon & Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, marginRight: '8px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? '#3b82f6' : 'transparent',
                    boxShadow: isActive ? '0 0 8px #3b82f6' : 'none'
                  }} />
                  
                  {isRenaming ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(view.id, e);
                        if (e.key === 'Escape') setIsRenamingId(null);
                      }}
                      autoFocus
                      style={{
                        background: '#0f172a',
                        border: '1px solid #3b82f6',
                        borderRadius: '6px',
                        color: 'white',
                        padding: '2px 6px',
                        fontSize: '0.8rem',
                        width: '100%',
                        outline: 'none'
                      }}
                    />
                  ) : (
                    <span style={{
                      fontSize: '0.8rem',
                      fontWeight: isActive ? '600' : '400',
                      color: isActive ? '#f8fafc' : '#cbd5e1'
                    }}>
                      {view.name}
                    </span>
                  )}
                </div>

                {/* Right side: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isRenaming ? (
                    <>
                      <button
                        onClick={(e) => handleRenameSubmit(view.id, e)}
                        style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: '2px' }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsRenamingId(null); }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : isConfirming ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.2)', padding: '2px 6px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#fca5a5' }}>確認刪除？</span>
                      <button
                        onClick={(e) => handleDeleteConfirm(view.id, e)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0', fontSize: '0.65rem', fontWeight: 'bold' }}
                      >
                        是
                      </button>
                      <span style={{ color: '#cbd5e1', fontSize: '0.65rem' }}>/</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0', fontSize: '0.65rem' }}
                      >
                        否
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={(e) => handleRenameStart(view, e)}
                        title="重新命名"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#3b82f6'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(view.id, e)}
                        title="刪除視角"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 實時視角數值與手動微調 */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>⚙️ 實時相機數值與微調</span>
        </div>
        
        {/* Position */}
        <div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>相機位置 (Camera Position)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            {['X', 'Y', 'Z'].map(axis => {
              const field = `pos${axis}`;
              return (
                <div key={axis} style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '2px 6px' }}>
                  <span style={{ fontSize: '0.65rem', color: '#475569', marginRight: '4px' }}>{axis}</span>
                  <input
                    type="number"
                    step="0.1"
                    data-camera-field="true"
                    value={localState[field]}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', fontSize: '0.75rem', outline: 'none', padding: 0 }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Target */}
        <div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>目標焦點 (Camera Target)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            {['X', 'Y', 'Z'].map(axis => {
              const field = `tar${axis}`;
              return (
                <div key={axis} style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '2px 6px' }}>
                  <span style={{ fontSize: '0.65rem', color: '#475569', marginRight: '4px' }}>{axis}</span>
                  <input
                    type="number"
                    step="0.1"
                    data-camera-field="true"
                    value={localState[field]}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', fontSize: '0.75rem', outline: 'none', padding: 0 }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Zoom */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>鏡頭縮放 (Camera Zoom)</span>
          <div style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '2px 6px', width: '100px' }}>
            <span style={{ fontSize: '0.65rem', color: '#475569', marginRight: '4px' }}>🔍</span>
            <input
              type="number"
              step="0.05"
              data-camera-field="true"
              value={localState.zoom}
              onChange={(e) => handleFieldChange('zoom', e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', fontSize: '0.75rem', outline: 'none', padding: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Save Current View Form */}
      {isAdding ? (
        <div style={{
          background: 'rgba(15, 23, 42, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <input
            type="text"
            placeholder="輸入新視角名稱... (可空白)"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: 'white',
              padding: '6px 10px',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleAddSubmit}
              style={{
                flex: 1,
                background: '#8b5cf6',
                border: 'none',
                borderRadius: '8px',
                padding: '6px',
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              儲存目前相機視角
            </button>
            <button
              onClick={() => setIsAdding(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '6px 10px',
                color: '#cbd5e1',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleAddClick}
          style={{
            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            border: 'none',
            borderRadius: '10px',
            padding: '10px',
            color: 'white',
            fontWeight: '600',
            fontSize: '0.8rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <Plus size={16} />
          儲存目前相機視角
        </button>
      )}
    </div>
  );
}
