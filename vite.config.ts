import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'obscura.1.209.148.143.nip.io',
    port: 7771,        
    strictPort: true,     // 포트가 이미 사용 중이면 실패하게 (옵션)
  },
})
