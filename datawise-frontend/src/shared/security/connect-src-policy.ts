/**
 * Build connect-src origins for CSP without a bare `https:` / `wss:` wildcard.
 * Remote API origin is taken from localStorage prefs (same key as api-server-prefs).
 */

import {
    API_SERVER_STORAGE_KEY,
    loadApiServerPreferences,
    normalizeApiServerUrl,
} from '@/shared/api/api-server-prefs'

export const CONNECT_SRC_BASE: string[] = [
    "'self'",
    'app:',
    'http://127.0.0.1:*',
    'http://localhost:*',
    'ws://127.0.0.1:*',
    'ws://localhost:*',
]

/** Origins derived from a remote API base URL (http(s) + matching ws(s)). */
export function connectSrcExtrasForRemoteApi(remoteUrl: string): string[] {
    const normalized = normalizeApiServerUrl(remoteUrl)
    if (!normalized) return []
    try {
        const parsed = new URL(normalized)
        const extras = [parsed.origin]
        if (parsed.protocol === 'https:') {
            extras.push(`wss://${parsed.host}`)
        } else if (parsed.protocol === 'http:') {
            extras.push(`ws://${parsed.host}`)
        }
        return extras
    } catch {
        return []
    }
}

export function resolveConnectSrcDirectives(prefs = loadApiServerPreferences()): string[] {
    const out = [...CONNECT_SRC_BASE]
    if (prefs.mode === 'remote' && prefs.remoteUrl) {
        out.push(...connectSrcExtrasForRemoteApi(prefs.remoteUrl))
    }
    return out
}

/** Boot / settings helper: storage key used by the index.html CSP injector. */
export const CONNECT_SRC_STORAGE_KEY = API_SERVER_STORAGE_KEY
