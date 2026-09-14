import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['assets/fmwa.png'],
      workbox: {
        // banner.png is ~2.6MB; raise the precache limit so it works offline
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,svg,woff2}'],
        // Admin chunk carries supabase-js; never precache it for public visitors.
        globIgnores: ['**/Admin-*.js', '**/Admin-*.css'],
        // Without this, the SW's navigateFallback serves cached index.html for
        // an address-bar visit to /api/users, which looks exactly like the
        // vercel.json catch-all swallowing the function when nothing is wrong.
        navigateFallbackDenylist: [/^\/api\//]
      },
      manifest: {
        name: 'Fortune Meadows Welfare Association',
        short_name: 'Fortune Meadows',
        description: 'Colony welfare association — events, galleries and announcements.',
        theme_color: '#17120c',
        background_color: '#f2e8d5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/assets/fmwa.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/assets/fmwa.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
