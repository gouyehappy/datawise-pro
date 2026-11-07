import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    extractHostFromConnectionName,
    formatSqlFileTabLabel,
    getBoundConsoleSqlFile,
    isSameConsoleTabLabel,
    isValidSqlFileBaseName,
    parseConsoleTabTitle,
    buildConsoleTabTitleFromParts,
    resolveConsoleSqlFileName,
    resolveConsoleTabTitle,
    resolveNextConsoleScriptFileName,
    resolveSqlFileForLocate,
    sqlFileNameFromTabLabel,
    syncConsoleTabTitle,
} from '../../features/workspace/services/console-tab-title.ts'

describe('console tab title', () => {
    it('uses host and script file label', () => {
        assert.equal(
            resolveConsoleTabTitle({
                connectionHost: '192.0.2.141',
                sqlFile: 'Script-2.sql',
                kind: 'script',
            }),
            '<192.0.2.141> Script-2',
        )
    })

    it('uses host and Script-1 for blank console fallback', () => {
        assert.equal(
            resolveConsoleTabTitle({
                connectionHost: '192.0.2.141',
                kind: 'console',
            }),
            '<192.0.2.141> Script-1',
        )
    })

    it('extracts host from connection name', () => {
        assert.equal(extractHostFromConnectionName('DEV_192.0.2.141'), '192.0.2.141')
    })

    it('formats sql file label without extension', () => {
        assert.equal(formatSqlFileTabLabel('burying_business.sql'), 'burying_business')
        assert.equal(formatSqlFileTabLabel('dev(cdp).sql'), 'dev(cdp)')
        assert.equal(formatSqlFileTabLabel('Script-2.sql'), 'Script-2')
        assert.equal(formatSqlFileTabLabel('my-script.sql'), 'my-script')
        assert.equal(formatSqlFileTabLabel('-.sql'), '-')
    })

    it('rejects invalid rename labels that would corrupt file names', () => {
        assert.equal(sqlFileNameFromTabLabel('-'), '')
        assert.equal(sqlFileNameFromTabLabel('---'), '')
        assert.equal(sqlFileNameFromTabLabel('   '), '')
        assert.ok(!isValidSqlFileBaseName('-'))
        assert.equal(
            resolveConsoleTabTitle({connectionHost: '192.0.2.141', sqlFile: '-.sql', kind: 'script'}),
            '<192.0.2.141> -',
        )
    })

    it('parses host prefix and editable suffix', () => {
        assert.deepEqual(parseConsoleTabTitle('<192.0.2.141> Script-2'), {
            hostLabel: '192.0.2.141',
            editableLabel: 'Script-2',
            hasHostPrefix: true,
        })
    })

    it('rebuilds title from host and suffix', () => {
        assert.equal(
            buildConsoleTabTitleFromParts('192.0.2.141', 'my script'),
            '<192.0.2.141> my script',
        )
    })

    it('maps tab labels to sql file names for rename only', () => {
        assert.equal(sqlFileNameFromTabLabel('Script-2'), 'Script-2')
        assert.equal(sqlFileNameFromTabLabel('Script 2'), 'Script-2')
        assert.equal(sqlFileNameFromTabLabel('Console'), 'Console')
        assert.ok(isSameConsoleTabLabel('Script-2.sql', 'Script-2'))
        assert.ok(isSameConsoleTabLabel('Script-2.sql', 'Script 2'))
    })

    it('returns bound sql file only; blank tabs have no save target', () => {
        assert.equal(
            getBoundConsoleSqlFile({sqlFile: 'burying_business.sql'}),
            'burying_business.sql',
        )
        assert.equal(getBoundConsoleSqlFile({sqlFile: '  Script-1.sql  '}), 'Script-1.sql')
        assert.equal(getBoundConsoleSqlFile({sqlFile: ''}), null)
        assert.equal(getBoundConsoleSqlFile({}), null)
    })

    it('assigns incremental Script-N for open blank tabs', () => {
        const tabs = [
            {
                id: 'c1',
                type: 'console',
                connectionId: 'conn-1',
                instanceId: 'db-1',
                sqlFile: 'Script-1.sql',
                title: '<192.0.2.141> Script-1',
            },
            {
                id: 'c2',
                type: 'console',
                connectionId: 'conn-1',
                instanceId: 'db-1',
                sqlFile: 'Script-2.sql',
                title: '<192.0.2.141> Script-2',
            },
        ] as const

        assert.equal(
            resolveNextConsoleScriptFileName({tabs: [...tabs], connectionId: 'conn-1', instanceId: 'db-1'}),
            'Script-3.sql',
        )
    })

    it('assigns next Script-N when workspaces already has files on disk', () => {
        assert.equal(
            resolveNextConsoleScriptFileName({
                tabs: [
                    {
                        id: 'c1',
                        type: 'console',
                        connectionId: 'conn-1',
                        instanceId: 'db-1',
                        sqlFile: 'Script-1.sql',
                        title: '<192.0.2.141> Script-1',
                    },
                ],
                connectionId: 'conn-1',
                instanceId: 'db-1',
                diskFileNames: ['Script-1.sql', 'Script-2.sql', 'Script-3.sql'],
            }),
            'Script-4.sql',
        )
    })

    it('ignores provisional Script-1 title when allocating next file from disk', () => {
        // Blank console used to bind sqlFile from the provisional "<host> Script-1"
        // title and collide with an existing Script-1.sql in workspaces.
        assert.equal(
            resolveNextConsoleScriptFileName({
                tabs: [
                    {
                        id: 'c-new',
                        type: 'console',
                        connectionId: 'conn-1',
                        instanceId: 'db-1',
                        title: '<192.0.2.141> Script-1',
                    },
                ],
                connectionId: 'conn-1',
                instanceId: 'db-1',
                diskFileNames: ['Script-1.sql', 'Script-2.sql', 'Script-3.sql', 'Script-4.sql'],
                excludeTabId: 'c-new',
            }),
            'Script-5.sql',
        )
    })

    it('syncs blank console title when connection is known', () => {
        assert.equal(
            syncConsoleTabTitle(
                {type: 'console', title: 'Console', sqlFile: 'Script-3.sql'},
                'DEV_192.0.2.141',
            ),
            '<192.0.2.141> Script-3',
        )
    })

    it('syncs script tab host prefix when connection changes', () => {
        assert.equal(
            syncConsoleTabTitle(
                {type: 'console', title: '<10.0.0.1> 智能分群', sqlFile: '智能分群.sql'},
                'DEV_192.0.2.141',
            ),
            '<192.0.2.141> 智能分群',
        )
    })

    it('resolves sql file from tab title for locate/rename fallback', () => {
        assert.equal(
            resolveConsoleSqlFileName({
                type: 'console',
                title: '<192.0.2.141> Script-2',
            }),
            'Script-2.sql',
        )
        assert.equal(
            resolveSqlFileForLocate({
                type: 'console',
                sqlFile: 'Script-1.sql',
                title: 'ignored',
            }),
            'Script-1.sql',
        )
    })
})
