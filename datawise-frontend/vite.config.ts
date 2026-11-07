/**
 * Vite 构建配置
 *
 * - npm run dev / build：编译 Vue 前端（JCEF 与 Web 共用）
 * - '@' 别名指向 src/
 */
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve, dirname} from 'path'
import {fileURLToPath} from 'node:url'
import {sqlEditorAliasPlugin} from './vite/sql-editor-alias'
import {desktopHostThemeSeedPlugin} from './vite/desktop-host-theme-seed-plugin'
import {standardEditionAiStubPlugin} from './vite/standard-edition-plugin'
import ports from './runtime-ports.json' with {type: 'json'}

const datawiseEdition = process.env.VITE_DATAWISE_EDITION === 'standard' ? 'standard' : 'full'
const backendOrigin = `http://127.0.0.1:${ports.dev.backend}`
const __dirname = dirname(fileURLToPath(import.meta.url))

function packAwareManualChunks(id: string): string | undefined {
    const norm = id.replace(/\\/g, '/')
    if (norm.includes('node_modules/monaco-editor')) return 'monaco'
    if (norm.includes('node_modules/echarts')) return 'echarts'
    if (norm.includes('node_modules/exceljs') || norm.includes('node_modules/xlsx')) {
        return 'spreadsheet'
    }
    // Keep vue runtime together; locales are split so unused language stays out of first paint.
    if (norm.includes('/locales/en-US/')) return 'locale-en'
    if (norm.includes('/locales/zh-CN/')) return 'locale-zh'
    if (
        norm.includes('node_modules/vue/')
        || norm.includes('node_modules/@vue/')
        || norm.includes('node_modules/vue-router/')
        || norm.includes('node_modules/pinia/')
        || norm.includes('node_modules/vue-i18n/')
    ) {
        return 'vue-vendor'
    }
    if (datawiseEdition === 'full' && norm.includes('/features/ai/')) {
        return 'pack-ai'
    }
    return undefined
}

export default defineConfig(() => {
    const plugins = [vue(), sqlEditorAliasPlugin(), desktopHostThemeSeedPlugin()]
    const standardStub = standardEditionAiStubPlugin(datawiseEdition)
    if (standardStub) plugins.push(standardStub)

    return {
        base: '/',
        define: {
            'import.meta.env.VITE_DATAWISE_EDITION': JSON.stringify(datawiseEdition),
        },
        plugins,
        build: {
            // Production / Standard builds must not ship JS source maps with packs.
            sourcemap: false,
            rollupOptions: {
                output: {
                    manualChunks: packAwareManualChunks,
                },
            },
        },
        worker: {
            format: 'es',
        },
        resolve: {
            alias: {
                '@': resolve(__dirname, 'src'),
                '@datawise/sql-editor': resolve(__dirname, '../sql-editor/src'),
                '@sql-editor': resolve(__dirname, '../sql-editor/src'),
            },
            // sql-editor 经 alias 与 node_modules junction 双路径时，避免两份 cache 单例
            dedupe: ['monaco-editor', '@datawise/sql-editor'],
        },
        optimizeDeps: {
            include: ['monaco-editor'],
        },
        server: {
            host: '127.0.0.1',
            port: ports.dev.frontend,
            strictPort: true,
            fs: {
                // sql-editor 在 frontend 包外，Worker 与 alias 需读取 ../sql-editor
                allow: [resolve(__dirname, '..')],
            },
            proxy: {
                '/login': {target: backendOrigin, changeOrigin: true},
                '/signOut': {target: backendOrigin, changeOrigin: true},
                '/api': {
                    target: backendOrigin,
                    changeOrigin: true,
                    configure: (proxy) => {
                        // If upstream ever emits duplicate ACAO values (e.g. "null, null"),
                        // collapse to a single token before Vite forwards the response.
                        proxy.on('proxyRes', (proxyRes) => {
                            const acao = proxyRes.headers['access-control-allow-origin']
                            if (typeof acao === 'string' && acao.includes(',')) {
                                proxyRes.headers['access-control-allow-origin'] = acao.split(',')[0].trim()
                            } else if (Array.isArray(acao) && acao.length > 1) {
                                proxyRes.headers['access-control-allow-origin'] = acao[0]
                            }
                        })
                    },
                },
                // SSH / local PTY terminal WebSockets (browser cannot set custom auth headers)
                '/ws': {target: backendOrigin, changeOrigin: true, ws: true},
            },
        },
    }
})
