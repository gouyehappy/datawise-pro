/**
 * Desktop (JCEF) Monaco worker shim — default worker URLs are unreliable under
 * the host bridge / non-http origins, so use Vite-bundled Worker constructors.
 */
import {readDesktopBridge} from '@/features/layout/services/desktop-bridge'
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

function needsMonacoWorkerShim(): boolean {
    if (typeof window === 'undefined') return false
    if (readDesktopBridge()) return true
    const protocol = window.location.protocol
    return protocol === 'file:' || protocol === 'app:'
}

if (needsMonacoWorkerShim()) {
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
