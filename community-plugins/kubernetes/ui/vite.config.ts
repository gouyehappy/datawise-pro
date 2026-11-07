import { execFileSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/** Single-blob inline for .dwp packs (opaque-origin iframes cannot reliably
 *  load multi-chunk Vite assets via cookie/CORS). Dev `pnpm build` without
 *  DATAWISE_INLINE=1 keeps multi-file output for easier debugging. */
const datawiseInline = process.env.DATAWISE_INLINE === '1' || process.env.DATAWISE_INLINE === 'true'

export default defineConfig({
  // Relative base so iframe URL /api/.../ui/index.html resolves ./assets/* under ui/.
  base: process.env.DATAWISE_PREVIEW_ORIGIN || './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'datawise-build-signal',
      closeBundle() {
        if (datawiseInline) {
          execFileSync(
            process.execPath,
            [fileURLToPath(new URL('../scripts/inline-ui-assets.mjs', import.meta.url))],
            { stdio: 'inherit' },
          )
        }
        console.log('DATAWISE_UI_BUILD_SUCCESS')
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    // Keep fonts/images inlinable; JS stays as real files for DataWise CSP 'self'.
    assetsInlineLimit: datawiseInline ? 100_000_000 : 4096,
    modulePreload: false,
    rolldownOptions: datawiseInline
      ? { output: { codeSplitting: false, format: 'es' } }
      : undefined,
  },
})
