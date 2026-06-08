import React, { useMemo, useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import * as THREE from 'three';

const BagMesh = ({ faces, faceRotations, dimensions }) => {
  const materials = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const createMaterial = (dataUrl, faceKey, isOpenTop = false) => {
      if (isOpenTop) {
        return new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide });
      }
      if (!dataUrl) return new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide });
      const texture = loader.load(dataUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      
      // 處理貼圖旋轉，必須繞著正中心 (0.5, 0.5) 旋轉
      const rotationDeg = faceRotations ? (faceRotations[faceKey] || 0) : 0;
      if (rotationDeg !== 0) {
        texture.rotation = (rotationDeg * Math.PI) / 180;
        texture.center.set(0.5, 0.5);
      }
      
      return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, side: THREE.DoubleSide });
    };

    return [
      createMaterial(faces.right, 'right'),
      createMaterial(faces.left, 'left'),
      createMaterial(null, null, true), // Open top
      createMaterial(faces.bottom, 'bottom'),
      createMaterial(faces.front, 'front'),
      createMaterial(faces.back, 'back')
    ];
  }, [faces, faceRotations]);

  const bagArgs = dimensions || [2, 3, 1];

  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={bagArgs} />
      {materials.map((mat, idx) => (
        <primitive object={mat} attach={`material-${idx}`} key={idx} />
      ))}
    </mesh>
  );
};

const CameraController = forwardRef(({ shapeType, enableZoom, activePreset, onCameraStateChange }, ref) => {
  const { camera } = useThree();
  const controlsRef = useRef();

  // 動畫目標狀態
  const targetStateRef = useRef(null);
  const isAnimatingRef = useRef(false);

  // 向外通知相機當前狀態
  const handleStateNotify = () => {
    if (onCameraStateChange && controlsRef.current) {
      onCameraStateChange({
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controlsRef.current.target.x, y: controlsRef.current.target.y, z: controlsRef.current.target.z },
        zoom: camera.zoom
      });
    }
  };

  // 當外部傳入 activePreset 時，設定為動畫目標
  useEffect(() => {
    if (activePreset) {
      targetStateRef.current = activePreset;
      isAnimatingRef.current = true;
    }
  }, [activePreset]);

  // 載入儲存的相機狀態
  useEffect(() => {
    const saved = localStorage.getItem(`camera_state_${shapeType}`);
    if (saved) {
      try {
        const { position, target } = JSON.parse(saved);
        camera.position.set(position.x, position.y, position.z);
        camera.updateProjectionMatrix();
        
        const timer = setTimeout(() => {
          if (controlsRef.current) {
            controlsRef.current.target.set(target.x, target.y, target.z);
            controlsRef.current.update();
            handleStateNotify(); // 初始狀態回報
          }
        }, 50);
        return () => clearTimeout(timer);
      } catch (e) {
        console.error(e);
      }
    } else {
      // 若無存檔，則在一段時間後回報預設狀態
      const timer = setTimeout(() => {
        handleStateNotify();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [camera, shapeType]);

  // 透過 ref 暴露目前相機狀態
  useImperativeHandle(ref, () => ({
    getCurrentState: () => {
      return {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
        target: controlsRef.current
          ? { x: controlsRef.current.target.x, y: controlsRef.current.target.y, z: controlsRef.current.target.z }
          : { x: 0, y: 0, z: 0 },
        distance: controlsRef.current
          ? camera.position.distanceTo(controlsRef.current.target)
          : camera.position.length(),
        zoom: camera.zoom
      };
    }
  }));

  // 相機手動旋轉、縮放後的儲存回呼
  const handleChange = () => {
    // 只有當不在進行自動對齊動畫時，才保存手動調整的視角
    if (controlsRef.current && !isAnimatingRef.current) {
      const state = {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controlsRef.current.target.x, y: controlsRef.current.target.y, z: controlsRef.current.target.z }
      };
      localStorage.setItem(`camera_state_${shapeType}`, JSON.stringify(state));
    }
    handleStateNotify();
  };

  // 每影格平滑插值插軌
  useFrame(() => {
    if (isAnimatingRef.current && targetStateRef.current) {
      const target = targetStateRef.current;

      // 平滑插值相機位置
      camera.position.lerp(new THREE.Vector3(target.position.x, target.position.y, target.position.z), 0.1);

      // 平滑插值 controls 的焦點 (target)
      if (controlsRef.current) {
        const ctrlTarget = new THREE.Vector3(target.target.x, target.target.y, target.target.z);
        controlsRef.current.target.lerp(ctrlTarget, 0.1);
      }

      // 平滑插值相機的 zoom (防禦性地相容舊數據，大於 10 的 zoom 縮小 100 倍以配適透視相機)
      if (target.zoom !== undefined) {
        const targetZoom = target.zoom > 10 ? target.zoom / 100 : target.zoom;
        camera.zoom = THREE.MathUtils.lerp(camera.zoom, targetZoom, 0.1);
      }

      camera.updateProjectionMatrix();
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      handleStateNotify(); // 動畫過程中實時通知狀態

      // 檢查是否已足夠接近目標
      const posDist = camera.position.distanceTo(new THREE.Vector3(target.position.x, target.position.y, target.position.z));
      const targetDist = controlsRef.current
        ? controlsRef.current.target.distanceTo(new THREE.Vector3(target.target.x, target.target.y, target.target.z))
        : 0;

      if (posDist < 0.005 && targetDist < 0.005) {
        isAnimatingRef.current = false;
        // 動畫結束，精確對齊
        camera.position.set(target.position.x, target.position.y, target.position.z);
        if (controlsRef.current) {
          controlsRef.current.target.set(target.target.x, target.target.y, target.target.z);
          controlsRef.current.update();
        }
        camera.updateProjectionMatrix();
        handleStateNotify();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom={enableZoom}
      makeDefault
      onChange={handleChange}
    />
  );
});

const Bag3D = forwardRef(({ faces, faceRotations, dimensions, activePreset, onCameraStateChange }, ref) => {
  const [isActive, setIsActive] = useState(false);
  const controllerRef = useRef();
  const hasSavedCamera = !!localStorage.getItem('camera_state_bag');

  // 對外暴露取得目前相機狀態的方法
  useImperativeHandle(ref, () => ({
    getCurrentCameraState: () => {
      if (controllerRef.current) {
        return controllerRef.current.getCurrentState();
      }
      return null;
    }
  }));

  return (
    <div 
      onClick={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      style={{ width: '100%', height: '100%', position: 'relative', cursor: isActive ? 'grab' : 'pointer' }}
    >
      <Canvas shadows camera={{ position: [0, 2, 6], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
        <Stage environment="apartment" intensity={0.6} adjustCamera={!hasSavedCamera}>
          <BagMesh faces={faces} faceRotations={faceRotations} dimensions={dimensions} />
        </Stage>
        <CameraController ref={controllerRef} shapeType="bag" enableZoom={isActive} activePreset={activePreset} onCameraStateChange={onCameraStateChange} />
      </Canvas>
      
      {!isActive && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#cbd5e1',
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '0.8rem',
          pointerEvents: 'none',
          zIndex: 5,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span>💡 點擊 3D 視窗以啟用滾輪縮放</span>
        </div>
      )}
    </div>
  );
});

export default Bag3D;
