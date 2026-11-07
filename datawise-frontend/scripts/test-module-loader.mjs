/**
 * Node test loader: stub style imports and inject Vite-style import.meta.env for src/*.ts.
 * Chains after tsx (--import tsx --import ./scripts/test-setup.mjs).
 */
const STYLE_RE = /\.(css|scss|less|sass)(?:\?.*)?$/
const VUE_RE = /\.vue(?:\?.*)?$/
const MONACO_RE = /[/\\]monaco-editor[/\\]/
const SRC_TS_RE = /[/\\]datawise-frontend[/\\]src[/\\].*\.(?:tsx?|mts)$/
const SQL_EDITOR_TS_RE = /[/\\]sql-editor[/\\]src[/\\].*\.(?:tsx?|mts)$/

const MONACO_STUB_SOURCE = `export * from ${JSON.stringify(new URL('./test-monaco-stub.mjs', import.meta.url).href)};\nexport {default} from ${JSON.stringify(new URL('./test-monaco-stub.mjs', import.meta.url).href)};`

function injectImportMetaEnv(source) {
    if (!source.includes('import.meta.env')) {
        return source
    }
    return source.replace(/import\.meta\.env\b/g, 'globalThis.__importMetaEnv')
}

export async function load(url, context, nextLoad) {
    if (MONACO_RE.test(url)) {
        return {
            format: 'module',
            shortCircuit: true,
            source: MONACO_STUB_SOURCE,
        }
    }

    if (STYLE_RE.test(url)) {
        return {
            format: 'module',
            shortCircuit: true,
            source: 'export default {}',
        }
    }

    if (VUE_RE.test(url)) {
        return {
            format: 'module',
            shortCircuit: true,
            source: 'export default { name: "TestVueStub" }',
        }
    }

    const result = await nextLoad(url, context)
    if (result.format !== 'module') {
        return result
    }

    const sourceText = typeof result.source === 'string'
        ? result.source
        : Buffer.from(result.source).toString('utf8')

    if (!SRC_TS_RE.test(url) && !SQL_EDITOR_TS_RE.test(url)) {
        return result
    }

    const source = injectImportMetaEnv(sourceText)
    if (source === sourceText) {
        return result
    }
    return {...result, source}
}
