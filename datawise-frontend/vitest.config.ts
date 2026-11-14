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
        // Force a single Vue / reka-ui runtime. Split installs (repo root vs datawise-frontend)
        // make reka-ui DialogRoot call renderSlot with a null currentRenderingInstance
        // → TypeError: Cannot read properties of null (reading 'ce'), info=render function.
        alias: {
            '@': resolve(__dirname, 'src'),
            '@datawise/sql-editor': resolve(__dirname, '../sql-editor/src'),
            '@sql-editor': resolve(__dirname, '../sql-editor/src'),
            'monaco-editor': monacoEditorRoot,
            vue: resolve(__dirname, 'node_modules/vue'),
            '@vue/runtime-core': resolve(__dirname, 'node_modules/@vue/runtime-core'),
            '@vue/runtime-dom': resolve(__dirname, 'node_modules/@vue/runtime-dom'),
            '@vue/reactivity': resolve(__dirname, 'node_modules/@vue/reactivity'),
            '@vue/shared': resolve(__dirname, 'node_modules/@vue/shared'),
            'reka-ui': resolve(__dirname, 'node_modules/reka-ui'),
        },
        dedupe: [
            'monaco-editor',
            'vue',
            '@vue/runtime-core',
            '@vue/runtime-dom',
            '@vue/reactivity',
            '@vue/shared',
            'reka-ui',
        ],
    },
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.spec.ts'],
        css: false,
        globals: false,
    },
})
