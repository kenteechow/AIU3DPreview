/**
 * 3D 相機視角管理服務
 * 用於處理預設視角生成以及 localStorage 永久保存
 */

// 預設視角生成器
export const createDefaultCameraViews = () => {
  const now = new Date().toISOString();
  const defaultDistance = 5.5;

  return [
    {
      id: 'default-front',
      name: 'Front / 正面',
      position: { x: 0, y: 0, z: defaultDistance },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      distance: defaultDistance,
      zoom: 1.2,
      createdAt: now,
      updatedAt: now,
      isDefault: true
    },
    {
      id: 'default-back',
      name: 'Back / 背面',
      position: { x: 0, y: 0, z: -defaultDistance },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      distance: defaultDistance,
      zoom: 1.2,
      createdAt: now,
      updatedAt: now,
      isDefault: true
    },
    {
      id: 'default-left',
      name: 'Left / 左側',
      position: { x: -defaultDistance, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      distance: defaultDistance,
      zoom: 1.2,
      createdAt: now,
      updatedAt: now,
      isDefault: true
    },
    {
      id: 'default-right',
      name: 'Right / 右側',
      position: { x: defaultDistance, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      distance: defaultDistance,
      zoom: 1.2,
      createdAt: now,
      updatedAt: now,
      isDefault: true
    },
    {
      id: 'default-top',
      name: 'Top / 上方',
      position: { x: 0, y: defaultDistance, z: 0.0001 },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      distance: defaultDistance,
      zoom: 1.2,
      createdAt: now,
      updatedAt: now,
      isDefault: true
    },
    {
      id: 'default-bottom',
      name: 'Bottom / 下方',
      position: { x: 0, y: -defaultDistance, z: 0.0001 },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      distance: defaultDistance,
      zoom: 1.2,
      createdAt: now,
      updatedAt: now,
      isDefault: true
    },
    {
      id: 'default-three-quarter',
      name: 'Three Quarter / 45 度斜角',
      position: { x: 3.5, y: 3.5, z: 3.5 },
      rotation: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      distance: defaultDistance,
      zoom: 1.2,
      createdAt: now,
      updatedAt: now,
      isDefault: true
    }
  ];
};

// 取得 localStorage 的 key
const getStorageKey = (productId) => {
  const safeId = productId ? encodeURIComponent(productId) : 'default';
  return `product-camera-views-${safeId}`;
};

export const cameraViewStorage = {
  // 載入指定產品的視角列表
  loadViews: (productId) => {
    try {
      const key = getStorageKey(productId);
      const data = localStorage.getItem(key);
      if (!data) {
        // 如果沒有保存過的視角，則回傳預設視角並寫入保存
        const defaults = createDefaultCameraViews();
        localStorage.setItem(key, JSON.stringify(defaults));
        return defaults;
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('無法自 localStorage 讀取視角設定：', error);
      return createDefaultCameraViews();
    }
  },

  // 儲存指定產品的視角列表
  saveViews: (productId, views) => {
    try {
      const key = getStorageKey(productId);
      localStorage.setItem(key, JSON.stringify(views));
      return true;
    } catch (error) {
      console.error('無法儲存視角設定至 localStorage：', error);
      return false;
    }
  },

  // 重置回預設視角
  resetToDefault: (productId) => {
    const defaults = createDefaultCameraViews();
    cameraViewStorage.saveViews(productId, defaults);
    return defaults;
  }
};
