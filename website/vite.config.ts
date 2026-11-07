import {defineConfig} from 'vite'

/** GitHub project Pages: set VITE_BASE=/datawise-cli/ when building. */
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 4173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
})
