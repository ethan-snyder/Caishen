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
    // The Python backend lives inside this project, so Vite's dev-server
    // file watcher covers it by default -- and that created a loop that
    // reloaded the whole app every few seconds:
    //
    //   page loads -> frontend calls /api/... -> backend appends a line to
    //   backend/events_log.txt -> Vite's watcher sees a file change under
    //   root -> full page reload -> page loads -> ...
    //
    // It never settled, because the app always fetches something on load,
    // and the ticker tape keeps the backend logging even while idle. From
    // the user's seat this looked like the screen randomly blinking out
    // for a second.
    //
    // None of these paths are part of the frontend module graph, so there
    // is nothing here Vite could ever hot-update. Watching them was pure
    // cost. (.venv especially -- thousands of files, and chokidar walks
    // all of them at startup.)
    watch: {
      ignored: [
        '**/backend/**',
        '**/.venv/**',
        '**/__pycache__/**',
        '**/*.py',
        '**/*_log.txt',
      ],
    },
    proxy: {
      // Frontend code calls fetch('/api/...'); Vite forwards it to the
      // FastAPI backend (run separately: `uvicorn api:app --port 8000`
      // from backend/) so no CORS handling is needed in dev.
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
      // Same backend, but for the live streams (/ws/crypto prices,
      // /ws/tape for the top-banner ticker) -- needs `ws: true` since
      // these are WebSockets, not plain HTTP proxies.
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
