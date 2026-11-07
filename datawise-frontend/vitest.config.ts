import {defineConfig} from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'node:path'

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@datawise/sql-editor': resolve(__dirname, '../sql-editor/src'),
            '@sql-editor': resolve(__dirname, '../sql-editor/src'),
        },
    },
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.spec.ts'],
        css: false,
        globals: false,
    },
})
