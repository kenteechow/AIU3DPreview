import { useState, useEffect, useCallback } from 'react';
import { cameraViewStorage } from '../utils/cameraViewStorage';

export function useCameraViewPresets(productId) {
  const [views, setViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);

  // 初始化與產品切換時載入資料
  useEffect(() => {
    const loadedViews = cameraViewStorage.loadViews(productId);
    setViews(loadedViews);
    if (loadedViews.length > 0) {
      // 預設選中第一個（一般是 Front / 正面）
      setActiveViewId(loadedViews[0].id);
    } else {
      setActiveViewId(null);
    }
  }, [productId]);

  // 儲存視角列表的輔助方法
  const updateViews = useCallback((newViews) => {
    setViews(newViews);
    cameraViewStorage.saveViews(productId, newViews);
  }, [productId]);

  // 新增視角
  const addView = useCallback((name, cameraState) => {
    const now = new Date().toISOString();
    
    // 計算自訂視角的編號名稱，例如 Custom View 1
    let finalName = name?.trim();
    if (!finalName) {
      const customViewsCount = views.filter(v => v.name.startsWith('Custom View')).length;
      finalName = `Custom View ${customViewsCount + 1}`;
    }

    const newView = {
      id: `custom-${Date.now()}`,
      name: finalName,
      position: { ...cameraState.position },
      rotation: cameraState.rotation ? { ...cameraState.rotation } : { x: 0, y: 0, z: 0 },
      target: { ...cameraState.target },
      distance: cameraState.distance || 5.5,
      zoom: cameraState.zoom || 120,
      createdAt: now,
      updatedAt: now,
      isDefault: false
    };

    const updated = [...views, newView];
    updateViews(updated);
    setActiveViewId(newView.id);
    return newView;
  }, [views, updateViews]);

  // 刪除視角
  const deleteView = useCallback((id) => {
    const index = views.findIndex(v => v.id === id);
    if (index === -1) return;

    const updated = views.filter(v => v.id !== id);
    updateViews(updated);

    // 如果刪除的是目前選中的視角，切換到下一個
    if (activeViewId === id) {
      if (updated.length > 0) {
        // 如果有下一個，就選下一個；如果已經是最後一個，就選新的最後一個
        const nextIndex = Math.min(index, updated.length - 1);
        setActiveViewId(updated[nextIndex].id);
      } else {
        setActiveViewId(null);
      }
    }
  }, [views, activeViewId, updateViews]);

  // 重新命名視角
  const renameView = useCallback((id, newName) => {
    if (!newName || !newName.trim()) return;

    const updated = views.map(v => {
      if (v.id === id) {
        return {
          ...v,
          name: newName.trim(),
          updatedAt: new Date().toISOString()
        };
      }
      return v;
    });

    updateViews(updated);
  }, [views, updateViews]);

  // 恢復預設視角
  const resetViews = useCallback(() => {
    const defaults = cameraViewStorage.resetToDefault(productId);
    setViews(defaults);
    if (defaults.length > 0) {
      setActiveViewId(defaults[0].id);
    } else {
      setActiveViewId(null);
    }
  }, [productId]);

  // 取得目前選中的視角資料
  const activeView = views.find(v => v.id === activeViewId) || null;

  return {
    views,
    activeViewId,
    activeView,
    setActiveViewId,
    addView,
    deleteView,
    renameView,
    resetViews
  };
}
