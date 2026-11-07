import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_BOOKMARK_FOLDER,
    QUERY_LIBRARY_FOLDER,
    bookmarksFromTeamLibrary,
    collectBookmarkTags,
    filterQueryBookmarks,
    groupBookmarksByFolder,
    mergeQueryBookmarks,
    normalizeBookmarkFolder,
    parseBookmarkTags,
    reportTemplateFolder,
} from '@/features/workspace/services/query-bookmark.service'
import {REPORT_SQL_TEMPLATES} from '@/features/workspace/constants/report-sql-templates'

describe('query-bookmark.service', () => {
    it('normalizes folder and parses tags', () => {
        assert.equal(normalizeBookmarkFolder(''), DEFAULT_BOOKMARK_FOLDER)
        assert.equal(normalizeBookmarkFolder('默认'), DEFAULT_BOOKMARK_FOLDER)
        assert.equal(normalizeBookmarkFolder('报表模板/daily'), 'report-template/daily')
        assert.deepEqual(parseBookmarkTags('报表, 分析'), ['报表', '分析'])
    })

    it('groups and filters bookmarks', () => {
        const items = mergeQueryBookmarks([
            {
                id: '1',
                name: 'Sales',
                connectionName: 'mysql',
                updatedAt: 'today',
                sql: 'SELECT 1',
                folder: '报表',
                tags: ['daily'],
            },
            {
                id: '2',
                name: 'Users',
                connectionName: 'mysql',
                updatedAt: 'today',
                sql: 'SELECT 2',
                tags: ['ops'],
            },
        ], [], false)

        assert.equal(collectBookmarkTags(items).length, 2)
        const grouped = groupBookmarksByFolder(filterQueryBookmarks(items, 'sales'))
        assert.equal(grouped.length, 1)
        assert.equal(grouped[0][0], '报表')
        assert.equal(grouped[0][1][0].name, 'Sales')
    })

    it('includes report templates and filters by category', () => {
        const items = mergeQueryBookmarks([])
        assert.ok(items.some((item) => item.source === 'report-template'))
        assert.equal(items.length, REPORT_SQL_TEMPLATES.length)

        const daily = filterQueryBookmarks(items, '', null, 'daily')
        assert.ok(daily.length >= 2)
        assert.ok(daily.every((item) => item.reportCategory === 'daily'))

        const grouped = groupBookmarksByFolder(daily)
        assert.equal(grouped[0][0], reportTemplateFolder('daily'))
    })

    it('maps team Query Library rows and sorts the folder first', () => {
        assert.equal(normalizeBookmarkFolder('查询库'), QUERY_LIBRARY_FOLDER)
        const library = bookmarksFromTeamLibrary('team-1', [
            {
                id: 'q1',
                teamId: 'team-1',
                title: 'Revenue',
                description: 'daily',
                connectionId: 'c1',
                connectionName: 'prod',
                database: 'dw',
                tags: ['finance'],
                sharedByUserName: 'a',
                sharedByUserId: 1,
                sharedAt: '2026-01-01',
                updatedAt: '2026-01-02',
                commentCount: 0,
                favoriteCount: 1,
                starredByCurrentUser: true,
            },
        ])
        assert.equal(library.length, 1)
        assert.equal(library[0].source, 'team-library')
        assert.equal(library[0].folder, QUERY_LIBRARY_FOLDER)
        assert.equal(library[0].teamQueryId, 'q1')

        const merged = mergeQueryBookmarks([], [], false, library)
        const grouped = groupBookmarksByFolder(merged)
        assert.equal(grouped[0][0], QUERY_LIBRARY_FOLDER)
        assert.equal(grouped[0][1][0].name, 'Revenue')
        assert.ok(collectBookmarkTags(library).includes('finance'))
    })
})
