import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Vite config — https://vitejs.dev/config/
//
// This is a trimmed-down version of the config Figma Make generates: the
// Figma-specific plugins (site metadata injection, error-overlay replay,
// the design-kit dev route) depend on a `.figma/make/site.json` file and a
// Figma Make runtime that only exist inside that environment, so they're
// dropped here in favor of a plain Vite + React + Tailwind setup plus a
// dev-server proxy to the FastAPI backend.
export default defineConfig({
  build: {
    sourcemap: false,
    minify: true,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '8443'),
    strictPort: true,
    proxy: {
      // Frontend code calls fetch('/api/...'); Vite forwards it to the
      // FastAPI backend (run separately: `uvicorn api:app --port 8000`
      // from backend/) so no CORS handling is needed in dev.
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
      // Same backend, but for the live crypto price stream (/ws/crypto) --
      // needs `ws: true` since this is a WebSocket, not a plain HTTP proxy.
      '/ws': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '8443'),
  },
})
