import { useNavigate } from 'react-router-dom';
import { Package, PenTool } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%', textAlign: 'center' }}>
        <h1 className="heading-gradient" style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          3D 包裝智能展開與渲染系統
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#cbd5e1', marginBottom: '3rem' }}>
          上傳平面包裝展開圖，一鍵智能拆分並生成 3D 產品預覽。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          
          {/* 客戶端介面入口 */}
          <div className="glass-panel" style={{ background: 'rgba(59, 130, 246, 0.1)', cursor: 'pointer', transition: 'transform 0.3s' }}
               onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'}
               onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
               onClick={() => navigate('/client')}>
            <Package size={48} color="#3b82f6" style={{ marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>客戶極簡模式</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              一鍵上傳，自動智能辨識邊界，即時產出 3D 預覽與展開圖。適合一般使用者。
            </p>
            <button className="btn-primary" style={{ width: '100%' }}>進入客戶模式</button>
          </div>

          {/* 設計師介面入口 */}
          <div className="glass-panel" style={{ background: 'rgba(139, 92, 246, 0.1)', cursor: 'pointer', transition: 'transform 0.3s' }}
               onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'}
               onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
               onClick={() => navigate('/designer')}>
            <PenTool size={48} color="#8b5cf6" style={{ marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>設計師專業模式</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              精細控制展開圖邊界，支援手動微調比例與 3D 材質設定。適合專業包裝設計師。
            </p>
            <button className="btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #8b5cf6, #d946ef)' }}>
              進入專業模式
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
