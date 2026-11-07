import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'node:path'

/**
 * Optional library prebuild for @datawise/sql-editor.
 * Host still consumes TypeScript source via Vite alias by default;
 * run `npm run build:lib` when packaging or CI wants a prebuilt dist.
 */
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@sql-editor': resolve(__dirname, 'src'),
            '@': resolve(__dirname, 'src'),
        },
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'DatawiseSqlEditor',
            formats: ['es'],
            fileName: () => 'index.js',
        },
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            external: [
                'vue',
                'monaco-editor',
                'sql-formatter',
                'dt-sql-parser',
                /^monaco-editor\//,
            ],
        },
    },
})
