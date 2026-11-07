/**
 * hostApi 1.2 UI storage wrapper.
 *
 * The workbench iframe runs at an opaque origin (sandbox="allow-scripts"), so
 * accessing `window.localStorage` throws SecurityError. UI preferences persist
 * through `datawisePlugin.storage` (host plugin data dir) instead, with a
 * guarded localStorage fallback for standalone dev.
 */

type BridgeStorage = {
    getAll?: () => Promise<Record<string, unknown>>
    get?: (key: string) => Promise<string | null>
    set?: (key: string, value: string) => Promise<void>
    remove?: (key: string) => Promise<void>
}

type HostPlugin = {
    ready?: Promise<unknown>
    storage?: BridgeStorage
}

let bridgeStorage: BridgeStorage | null = null
let cache: Record<string, string> | null = null

const READY_TIMEOUT_MS = 8_000
const STORAGE_TIMEOUT_MS = 5_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        promise.then(
            (value) => {
                window.clearTimeout(timer)
                resolve(value)
            },
            (err) => {
                window.clearTimeout(timer)
                reject(err)
            },
        )
    })
}

function readLocal(key: string): string | null {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeLocal(key: string, value: string | null): void {
    try {
        if (value == null) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, value)
    } catch {
        // localStorage unavailable — persistence degrades to session scope.
    }
}

/** Prime the cache from the host bridge; call once before mounting the app. */
export async function initUiStorage(): Promise<void> {
    const plugin = (window as unknown as { datawisePlugin?: HostPlugin }).datawisePlugin
    const storage = plugin?.storage
    if (storage && typeof storage.getAll === 'function') {
        try {
            // Wait for host env/hello so storage RPCs are not dropped before the
            // parent binds the iframe window — but never block first paint forever.
            if (plugin.ready) {
                await withTimeout(Promise.resolve(plugin.ready), READY_TIMEOUT_MS, 'datawisePlugin.ready')
            }
            const values = await withTimeout(
                storage.getAll(),
                STORAGE_TIMEOUT_MS,
                'host.storage.getAll',
            )
            if (values && typeof values === 'object') {
                const plain: Record<string, string> = {}
                for (const [key, value] of Object.entries(values)) {
                    if (typeof value === 'string') plain[key] = value
                }
                cache = plain
                bridgeStorage = storage
                return
            }
        } catch {
            // Bridge unavailable / timed out — fall back to guarded localStorage.
        }
    }
    cache = {}
}

export function readUiStorage(key: string): string | null {
    if (cache) return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null
    return readLocal(key)
}

export function writeUiStorage(key: string, value: string | null): void {
    if (cache) {
        if (value == null) delete cache[key]
        else cache[key] = value
    }
    if (bridgeStorage) {
        const write = value == null ? bridgeStorage.remove?.(key) : bridgeStorage.set?.(key, value)
        void write?.catch(() => {})
    } else {
        writeLocal(key, value)
    }
}
