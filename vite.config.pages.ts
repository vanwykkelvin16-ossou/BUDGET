/**
 * GitHub Pages build: served from a sub-path (username.github.io/REPO/),
 * so every URL is relative and routing uses the hash router. Keeps the PWA
 * manifest + service worker with relative scope so the app stays
 * installable from the Pages URL.
 *
 *   npm run build:pages   →  dist-pages/
 */
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['randy-logo.png', 'icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: './',
        name: 'PennyPlay',
        short_name: 'PennyPlay',
        description:
          'A playful, game-flavoured personal budgeting app for ZAR — safe-to-spend, streaks, quests and savings goals.',
        lang: 'en-ZA',
        dir: 'ltr',
        categories: ['finance', 'lifestyle'],
        theme_color: '#1A1033',
        background_color: '#1A1033',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Hash routing means the only document is index.html.
        navigateFallback: null,
      },
    }),
  ],
  define: {
    // Hash router — GitHub Pages has no history-API rewrites.
    'import.meta.env.VITE_SINGLEFILE': JSON.stringify('1'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-pages',
  },
})
