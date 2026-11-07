import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Opaque-origin iframes need a single HTML blob (gzip+DecompressionStream). */
const datawiseInline = process.env.DATAWISE_INLINE === '1' || process.env.DATAWISE_INLINE === 'true'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'datawise-inline',
      closeBundle() {
        if (!datawiseInline) return
        const indexHtml = resolve(__dirname, 'dist/index.html')
        try {
          execFileSync(process.execPath, [fileURLToPath(new URL('./scripts/inline-ui-assets.mjs', import.meta.url))], {
            stdio: 'inherit',
          })
        } catch (err) {
          // Surface after a failed emit so Rollup's real error remains primary.
          if (!existsSync(indexHtml)) return
          throw err
        }
      },
    },
  ],
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: datawiseInline ? 100_000_000 : 4096,
    modulePreload: false,
    chunkSizeWarningLimit: 8192,
    rollupOptions: datawiseInline
      ? {
          output: {
            inlineDynamicImports: true,
            manualChunks: undefined,
          },
        }
      : undefined,
  },
  worker: {
    format: 'es',
  },
})
