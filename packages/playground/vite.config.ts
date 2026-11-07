import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@datawise/tokens': path.resolve(__dirname, '../tokens/src'),
      '@datawise/theme': path.resolve(__dirname, '../theme/src'),
      '@datawise/icons': path.resolve(__dirname, '../icons/src'),
      '@datawise/ui': path.resolve(__dirname, '../ui/src'),
      '@datawise/overlays': path.resolve(__dirname, '../overlays/src'),
      '@datawise/chrome': path.resolve(__dirname, '../chrome/src'),
      '@datawise/data-grid': path.resolve(__dirname, '../data-grid/src'),
      '@datawise/code': path.resolve(__dirname, '../code/src'),
      '@datawise/framework': path.resolve(__dirname, '../framework/src'),
      '@datawise/framework/data-grid': path.resolve(__dirname, '../framework/src/data-grid.ts'),
      '@datawise/framework/code': path.resolve(__dirname, '../framework/src/code.ts'),
    },
  },
  server: {
    port: 5179,
  },
})
