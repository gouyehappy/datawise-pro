import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildDeepLinkExample,
    buildDeepLinkUrl,
    extractDeepLinkFromArgv,
    parseDeepLinkUrl,
} from '@/shared/deep-link/deep-link.service'

describe('deep-link.service', () => {
    it('parses datawise://open with connectionId database and sql', () => {
        const payload = parseDeepLinkUrl(
            'datawise://open?connectionId=conn-1&database=mydb&sql=SELECT%201',
        )
        assert.deepEqual(payload, {
            action: 'open',
            connectionId: 'conn-1',
            database: 'mydb',
            sql: 'SELECT 1',
        })
    })

    it('parses sql-only deep links', () => {
        const payload = parseDeepLinkUrl('datawise://open?sql=SHOW%20TABLES')
        assert.equal(payload?.action, 'open')
        assert.equal(payload?.sql, 'SHOW TABLES')
        assert.equal(payload?.connectionId, undefined)
    })

    it('parses connection/new ai plugin-install and analysis/canvas', () => {
        assert.deepEqual(parseDeepLinkUrl('datawise://connection/new?dbType=postgres'), {
            action: 'connection-new',
            dbType: 'postgres',
        })
        assert.deepEqual(parseDeepLinkUrl('datawise://ai'), {
            action: 'ai',
            connectionId: undefined,
            database: undefined,
        })
        assert.deepEqual(parseDeepLinkUrl('datawise://plugin/install?id=mysql'), {
            action: 'plugin-install',
            pluginId: 'mysql',
        })
        assert.deepEqual(
            parseDeepLinkUrl('datawise://analysis/canvas?connectionId=c1&database=db'),
            {
                action: 'analysis-canvas',
                connectionId: 'c1',
                database: 'db',
            },
        )
    })

    it('rejects invalid scheme host or empty params', () => {
        assert.equal(parseDeepLinkUrl('https://example.com'), null)
        assert.equal(parseDeepLinkUrl('datawise://other?sql=1'), null)
        assert.equal(parseDeepLinkUrl('datawise://open'), null)
        assert.equal(parseDeepLinkUrl('datawise://plugin/install'), null)
        assert.equal(parseDeepLinkUrl(''), null)
    })

    it('builds and extracts deep link urls', () => {
        const url = buildDeepLinkUrl({
            action: 'open',
            connectionId: 'c1',
            database: 'db',
            sql: 'SELECT 1',
        })
        assert.equal(url, 'datawise://open?connectionId=c1&database=db&sql=SELECT+1')
        assert.equal(buildDeepLinkExample().startsWith('datawise://open'), true)
        assert.equal(
            extractDeepLinkFromArgv(['app.exe', 'datawise://open?sql=1']),
            'datawise://open?sql=1',
        )
        assert.equal(
            buildDeepLinkUrl({action: 'connection-new', dbType: 'mysql'}),
            'datawise://connection/new?dbType=mysql',
        )
    })
})
