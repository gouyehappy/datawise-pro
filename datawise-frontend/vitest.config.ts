import {defineConfig} from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import {createRequire} from 'node:module'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
/** Prefer the frontend install — workspace root may hoist an older monaco without main/exports. */
const monacoEditorRoot = dirname(require.resolve('monaco-editor/package.json'))

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@datawise/sql-editor': resolve(__dirname, '../sql-editor/src'),
            '@sql-editor': resolve(__dirname, '../sql-editor/src'),
            'monaco-editor': monacoEditorRoot,
        },
        dedupe: ['monaco-editor'],
    },
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.spec.ts'],
        css: false,
        globals: false,
    },
})
