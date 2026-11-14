/**
 * Monaco worker shim — Vite-bundled Worker constructors.
 * Used for desktop (JCEF / file: / app:) and browser so CSP worker-src stays on
 * blob:/self without relying on Monaco's default CDN-style worker URLs.
 *
 * Note: bundling workers does NOT remove the need for script-src 'unsafe-eval';
 * Monaco's tokenizer still uses new Function on the main thread, and Vite HMR
 * needs eval in development.
 */
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

declare global {
    interface Window {
        MonacoEnvironment?: {
            getWorker: (_workerId: string, label: string) => Worker
        }
    }
}

if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
    window.MonacoEnvironment = {
        getWorker(_workerId, label) {
            if (label === 'json') return new jsonWorker()
            if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
            if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
            if (label === 'typescript' || label === 'javascript') return new tsWorker()
            return new editorWorker()
        },
    }
}
