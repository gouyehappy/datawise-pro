import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  base: './',
  build: {
    outDir: resolve(__dirname, '../ui'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
  },
})
