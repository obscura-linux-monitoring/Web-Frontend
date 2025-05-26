import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // host: 'localhost', // 호스트 이름
    host: true, // 정확한 모바일 동작확인을 위해 변경
    port: 5174,        
    strictPort: true,     // 포트가 이미 사용 중이면 실패하게 (옵션)
  },
})
