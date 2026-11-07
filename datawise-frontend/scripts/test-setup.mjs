/**
 * Node test bootstrap: browser globals used at module load time (localStorage, import.meta.env).
 */
import {register} from 'node:module'
import {pathToFileURL} from 'node:url'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import Module from 'node:module'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)
const setupDir = dirname(fileURLToPath(import.meta.url))
register('./test-module-loader.mjs', pathToFileURL(`${setupDir}/`))

/** Monaco/sql-editor pull .css via CJS require — stub before any test imports. */
if (Module._extensions) {
    Module._extensions['.css'] = (module) => {
        module.exports = {}
    }
    Module._extensions['.scss'] = Module._extensions['.css']
    Module._extensions['.less'] = Module._extensions['.css']
}

const monacoStubPath = join(setupDir, 'test-monaco-stub.cjs')
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
    if (typeof request === 'string' && request.includes('monaco-editor')) {
        // Monaco stub is CJS; Node Module._load requires require().
        return require(monacoStubPath)
    }
    return originalLoad.call(this, request, parent, isMain)
}

const storage = new Map()

function createStorage() {
    return {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null
        },
        setItem(key, value) {
            storage.set(key, String(value))
        },
        removeItem(key) {
            storage.delete(key)
        },
        clear() {
            storage.clear()
        },
        key(index) {
            return [...storage.keys()][index] ?? null
        },
        get length() {
            return storage.size
        },
    }
}

const locationStub = {
    protocol: 'http:',
    href: 'http://localhost/',
    hostname: 'localhost',
    host: 'localhost',
    port: '',
    pathname: '/',
    search: '',
    hash: '',
    origin: 'http://localhost',
}

/**
 * Prefer aliasing window → globalThis so timers / performance stay intact.
 * A bare `{location}` stub breaks vue-i18n (performance.now) and scheduleIdleWarmup (setTimeout).
 */
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis
}
if (!globalThis.window.location) {
    try {
        globalThis.window.location = locationStub
    } catch {
        Object.defineProperty(globalThis.window, 'location', {
            value: locationStub,
            configurable: true,
            writable: true,
        })
    }
}

if (typeof globalThis.location === 'undefined') {
    globalThis.location = locationStub
}

if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = {now: () => Date.now()}
}

/** Monaco editor initializes GPU task queue at import time and needs document.defaultView. */
if (typeof globalThis.document === 'undefined') {
    const elementStub = () => ({
        style: {},
        classList: {add() {}, remove() {}, contains: () => false},
        setAttribute() {},
        getAttribute: () => null,
        appendChild() {},
        removeChild() {},
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect: () => ({top: 0, left: 0, width: 0, height: 0}),
        querySelector: () => null,
        querySelectorAll: () => [],
    })
    globalThis.document = {
        defaultView: globalThis,
        documentElement: elementStub(),
        body: elementStub(),
        head: elementStub(),
        createElement: elementStub,
        createElementNS: elementStub,
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
    }
}

if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
        value: createStorage(),
        configurable: true,
        writable: true,
    })
}

if (typeof globalThis.sessionStorage === 'undefined') {
    Object.defineProperty(globalThis, 'sessionStorage', {
        value: createStorage(),
        configurable: true,
        writable: true,
    })
}

/** Minimal DOMParser for app-config-xml unit tests (CDATA JSON sections). */
if (typeof globalThis.DOMParser === 'undefined') {
    globalThis.DOMParser = class DOMParser {
        parseFromString(source, _type) {
            const cdataSections = new Map()
            for (const match of source.matchAll(/<([a-zA-Z0-9_-]+)[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g)) {
                cdataSections.set(match[1], match[2])
            }
            const root = {
                tagName: 'datawise-app',
                getAttribute(name) {
                    if (name === 'version') return source.match(/version="(\d+)"/)?.[1] ?? null
                    if (name === 'exported-at') return source.match(/exported-at="([^"]+)"/)?.[1] ?? null
                    return null
                },
                getElementsByTagName(tagName) {
                    const text = cdataSections.get(tagName)
                    return {
                        item(index) {
                            if (index !== 0 || text == null) return null
                            return {textContent: text}
                        },
                    }
                },
            }
            return {documentElement: root}
        }
    }
}

const testImportMetaEnv = {
    DEV: false,
    PROD: true,
    MODE: 'test',
    SSR: false,
    VITE_DATAWISE_EDITION:
        process.env.VITE_DATAWISE_EDITION === 'standard' ? 'standard' : 'full',
}
globalThis.__importMetaEnv = testImportMetaEnv
if (import.meta.env == null || import.meta.env.DEV === undefined) {
    try {
        Object.defineProperty(import.meta, 'env', {
            value: testImportMetaEnv,
            configurable: true,
            writable: true,
            enumerable: true,
        })
    } catch {
        Object.assign(import.meta, {env: testImportMetaEnv})
    }
}
