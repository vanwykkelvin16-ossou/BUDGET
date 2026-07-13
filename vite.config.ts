import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['randy-logo.png', 'icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: '/',
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
        start_url: '/',
        screenshots: [
          {
            src: 'screenshot-home.png',
            sizes: '1170x2532',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Fun money for today — your daily safe-to-spend number',
          },
          {
            src: 'screenshot-savings.png',
            sizes: '1170x2532',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Savings goals with milestones and auto-save',
          },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
