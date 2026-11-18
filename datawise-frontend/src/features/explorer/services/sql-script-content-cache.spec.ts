import {afterEach, describe, expect, it} from 'vitest'
import {
    clearSqlScriptContentCache,
    getCachedSqlScript,
    invalidateCachedSqlScript,
    renameCachedSqlScript,
    setCachedSqlScript,
    shouldPrefetchSqlScript,
} from '@/features/explorer/services/sql-script-content-cache'

const key = {
    connectionId: 'c1',
    instanceName: '_scripts',
    fileName: 'Script-1.sql',
}

afterEach(() => {
    clearSqlScriptContentCache()
})

describe('sql-script-content-cache', () => {
    it('stores and returns sql by key', () => {
        setCachedSqlScript(key, 'select 1')
        expect(getCachedSqlScript(key)).toBe('select 1')
    })

    it('renames cache entry', () => {
        setCachedSqlScript(key, 'select 2')
        renameCachedSqlScript(key, 'Script-2.sql')
        expect(getCachedSqlScript(key)).toBeNull()
        expect(getCachedSqlScript({...key, fileName: 'Script-2.sql'})).toBe('select 2')
    })

    it('invalidates a single entry', () => {
        setCachedSqlScript(key, 'select 3')
        invalidateCachedSqlScript(key)
        expect(getCachedSqlScript(key)).toBeNull()
    })

    it('skips prefetch for oversized hints', () => {
        expect(shouldPrefetchSqlScript()).toBe(true)
        expect(shouldPrefetchSqlScript(1024)).toBe(true)
        expect(shouldPrefetchSqlScript(512 * 1024)).toBe(false)
    })
})
