import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const inline = process.env.DATAWISE_INLINE === '1'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: resolve(__dirname, '../ui'),
    emptyOutDir: true,
    assetsDir: 'assets',
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: inline ? 100_000_000 : undefined,
    rollupOptions: inline
      ? {
          output: {
            inlineDynamicImports: true,
            manualChunks: undefined,
            entryFileNames: 'assets/index.js',
            chunkFileNames: 'assets/[name].js',
            assetFileNames: 'assets/[name][extname]',
          },
        }
      : undefined,
  },
  server: {
    port: 5174,
  },
})
