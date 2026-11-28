/**
 * In-memory cache for instance SQL script bodies.
 * Speeds up open / prefetch; invalidated on save / rename / delete.
 */

export type SqlScriptCacheKey = {
    connectionId: string
    instanceName: string
    fileName: string
}

type CacheEntry = {
    sql: string
    updatedAt: number
}

const MAX_ENTRIES = 64
const PREFETCH_MAX_BYTES = 256 * 1024

const store = new Map<string, CacheEntry>()

export function sqlScriptCacheKey(parts: SqlScriptCacheKey): string {
    return `${parts.connectionId}\0${parts.instanceName}\0${parts.fileName}`
}

export function getCachedSqlScript(parts: SqlScriptCacheKey): string | null {
    const entry = store.get(sqlScriptCacheKey(parts))
    return entry ? entry.sql : null
}

export function setCachedSqlScript(parts: SqlScriptCacheKey, sql: string): void {
    const key = sqlScriptCacheKey(parts)
    if (store.has(key)) store.delete(key)
    store.set(key, {sql, updatedAt: Date.now()})
    while (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next().value
        if (oldest == null) break
        store.delete(oldest)
    }
}

export function invalidateCachedSqlScript(parts: SqlScriptCacheKey): void {
    store.delete(sqlScriptCacheKey(parts))
}

export function invalidateCachedSqlScriptsForInstance(
    connectionId: string,
    instanceName: string,
): void {
    const prefix = `${connectionId}\0${instanceName}\0`
    for (const key of [...store.keys()]) {
        if (key.startsWith(prefix)) store.delete(key)
    }
}

export function renameCachedSqlScript(
    parts: SqlScriptCacheKey,
    newFileName: string,
): void {
    const sql = getCachedSqlScript(parts)
    invalidateCachedSqlScript(parts)
    if (sql != null) {
        setCachedSqlScript({...parts, fileName: newFileName}, sql)
    }
}

/** Skip prefetch for oversized payloads (caller may still open normally). */
export function shouldPrefetchSqlScript(byteLengthHint?: number): boolean {
    if (byteLengthHint == null || !Number.isFinite(byteLengthHint)) return true
    return byteLengthHint <= PREFETCH_MAX_BYTES
}

export function clearSqlScriptContentCache(): void {
    store.clear()
}

export const SQL_SCRIPT_PREFETCH_MAX_BYTES = PREFETCH_MAX_BYTES
