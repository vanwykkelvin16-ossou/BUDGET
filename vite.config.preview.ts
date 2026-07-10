/**
 * Single-file preview build: the whole app (JS, CSS, fonts) inlined into one
 * HTML file so it can be hosted anywhere a static page can — no server, no
 * service worker, hash-based routing.
 *
 *   npm run build:preview   →  dist-preview/index.html
 */
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_SINGLEFILE': JSON.stringify('1'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-preview',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5_000,
  },
})
