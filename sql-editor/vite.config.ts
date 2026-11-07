import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'node:path'

export default defineConfig({
    root: 'demo',
    plugins: [vue()],
    build: {
        outDir: '../dist-demo',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@sql-editor': resolve(__dirname, 'src'),
            '@': resolve(__dirname, 'src'),
            '@demo': resolve(__dirname, 'demo'),
        },
    },
    optimizeDeps: {
        include: ['monaco-editor'],
    },
    server: {
        port: 5175,
    },
})
