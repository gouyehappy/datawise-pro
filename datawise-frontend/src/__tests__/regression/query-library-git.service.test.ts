import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildQueryLibraryManifest,
    buildQueryLibraryManifestQuery,
    slugifyQueryLibraryId,
} from '@/features/workspace/services/query-library-git.service'
import type {QueryBookmarkItem} from '@/features/workspace/services/query-bookmark.service'

const sampleBookmark: QueryBookmarkItem = {
    id: 'console-42',
    name: 'Daily Active Users',
    sql: 'SELECT COUNT(*) FROM users;',
    connectionName: 'staging-mysql',
    folder: '默认',
    tags: ['kpi'],
    source: 'console',
}

describe('query-library-git.service', () => {
    it('slugifies bookmark names', () => {
        assert.equal(slugifyQueryLibraryId('Daily Active Users'), 'daily-active-users')
        assert.equal(slugifyQueryLibraryId('日报', 'console-42'), 'console-42')
        assert.equal(slugifyQueryLibraryId('中文'), 'query-query')
    })

    it('builds manifest query entry', () => {
        const entry = buildQueryLibraryManifestQuery(sampleBookmark)
        assert.equal(entry.id, 'daily-active-users')
        assert.equal(entry.file, 'queries/daily-active-users.sql')
        assert.equal(entry.connection, '')
        assert.equal(entry.connectionName, 'staging-mysql')
        assert.deepEqual(entry.tags, ['kpi'])
        assert.equal(entry.ci?.enabled, true)
    })

    it('builds versioned manifest', () => {
        const entry = buildQueryLibraryManifestQuery(sampleBookmark)
        const manifest = buildQueryLibraryManifest([entry])
        assert.equal(manifest.version, 1)
        assert.equal(manifest.queries.length, 1)
    })
})
