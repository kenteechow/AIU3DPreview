import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/AIU3DPreview/' // 確保靜態資源部署路徑與 Repository 名稱一致
})
