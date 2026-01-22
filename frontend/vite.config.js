import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: {
      protocol: 'wss',
      host: 'code-inspector-181.preview.emergentagent.com',
      port: 443
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
