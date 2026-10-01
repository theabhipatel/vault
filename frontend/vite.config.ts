import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// Where the FastAPI backend listens in development (see .env.example).
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:29100'

/**
 * Content Security Policy for the built app (also set by deploy/nginx.conf).
 * Scripts: our own origin only; no inline scripts, no eval. 'wasm-unsafe-eval' only allows
 * compiling WebAssembly (libsodium), not evaluating strings as code.
 * Styles allow inline because Radix/react-remove-scroll inject small <style> elements.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

/**
 * Adds Subresource Integrity (sha384) to every script, stylesheet and module preload referenced
 * by index.html. Hashes are computed from the final files on disk, after every other plugin.
 */
function subresourceIntegrity(): Plugin {
  return {
    name: 'vault-subresource-integrity',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist'
      const indexPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(indexPath)) return
      const html = fs.readFileSync(indexPath, 'utf8').replace(
        /<(script|link)\b[^>]*?\b(?:src|href)="([^"]+)"[^>]*>/g,
        (tag: string, element: string, url: string) => {
          if (element === 'link' && !/rel="(stylesheet|modulepreload)"/.test(tag)) return tag
          if (/\bintegrity=/.test(tag) || /^https?:/.test(url)) return tag
          const file = path.join(outDir, url.replace(/^\//, ''))
          if (!fs.existsSync(file)) return tag
          const digest = createHash('sha384').update(fs.readFileSync(file)).digest('base64')
          const withCors = /\bcrossorigin\b/.test(tag) ? tag : tag.replace(/>$/, ' crossorigin>')
          return withCors.replace(/>$/, ` integrity="sha384-${digest}">`)
        },
      )
      fs.writeFileSync(indexPath, html)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), subresourceIntegrity()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  worker: { format: 'es' },
  build: {
    // Never inline assets as data: URIs; the CSP only allows files from our own origin.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Keep the large crypto library in its own cacheable chunk.
        manualChunks: (id) => (id.includes('libsodium') ? 'libsodium' : undefined),
      },
    },
  },
  server: {
    port: 29180,
    strictPort: true,
    // The API is served from the same origin in every environment, so cookies stay
    // first-party and no CORS is needed. (No CSP in dev: Vite's HMR needs inline scripts.)
    proxy: {
      '/api': { target: apiTarget, xfwd: true },
    },
  },
  preview: {
    port: 29180,
    headers: SECURITY_HEADERS,
    proxy: {
      '/api': { target: apiTarget, xfwd: true },
    },
  },
})
