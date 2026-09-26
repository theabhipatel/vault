import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Where the FastAPI backend listens in development (see .env.example).
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5180,
    strictPort: true,
    // The API is served from the same origin in every environment, so cookies stay
    // first-party and no CORS is needed.
    proxy: {
      '/api': { target: apiTarget, xfwd: true },
    },
  },
  preview: {
    port: 5180,
    proxy: {
      '/api': { target: apiTarget, xfwd: true },
    },
  },
})
