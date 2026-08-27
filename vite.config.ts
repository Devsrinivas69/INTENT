import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // Mark ws optional native dependencies as external
              // so Vite does not try to bundle them
              external: ['bufferutil', 'utf-8-validate'],
            },
          },
        },
      },
      preload: {
        input: resolve(__dirname, 'electron/preload.ts'),
      },
      renderer: {},
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        panel: resolve(__dirname, 'panel.html'),
        overlay: resolve(__dirname, 'overlay.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
