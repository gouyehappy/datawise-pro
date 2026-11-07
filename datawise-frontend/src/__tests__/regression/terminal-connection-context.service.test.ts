import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildTerminalCliSnippet,
    supportsTerminalCliSnippet,
} from '@/features/terminal/services/terminal-connection-context.service'
import type {ConnectionConfig} from '@/core/types'

function baseConfig(overrides: Partial<ConnectionConfig>): ConnectionConfig {
    return {
        id: 'conn-1',
        name: 'Local',
        dbType: 'mysql',
        env: 'dev',
        storage: 'local',
        host: '10.0.0.1',
        port: '3306',
        auth: 'userPassword',
        user: 'root',
        password: 'secret',
        url: '',
        ...overrides,
    }
}

describe('terminal-connection-context.service', () => {
    it('builds mysql cli command without password in snippet', () => {
        const snippet = buildTerminalCliSnippet(baseConfig({dbType: 'mysql'}), 'app_db')
        assert.equal(snippet?.tool, 'mysql')
        assert.equal(snippet?.command, 'mysql -h 10.0.0.1 -P 3306 -u root -p app_db')
        assert.equal(snippet?.command.includes('secret'), false)
    })

    it('builds mariadb cli via mysql client', () => {
        const snippet = buildTerminalCliSnippet(baseConfig({dbType: 'mariadb', port: '3307'}))
        assert.equal(snippet?.tool, 'mysql')
        assert.match(snippet?.command ?? '', /-P 3307/)
    })

    it('builds psql cli for postgresql', () => {
        const snippet = buildTerminalCliSnippet(
            baseConfig({
                dbType: 'postgresql',
                port: '5432',
                user: 'postgres',
                database: 'warehouse',
            }),
        )
        assert.equal(snippet?.tool, 'psql')
        assert.equal(snippet?.command, 'psql -h 10.0.0.1 -p 5432 -U postgres -d warehouse')
    })

    it('prefers active tab database over config default', () => {
        const snippet = buildTerminalCliSnippet(
            baseConfig({database: 'ignored'}),
            'active_db',
        )
        assert.match(snippet?.command ?? '', /active_db$/)
    })

    it('quotes unsafe cli arguments', () => {
        const snippet = buildTerminalCliSnippet(
            baseConfig({host: 'db host', user: 'app user'}),
            'my db',
        )
        assert.match(snippet?.command ?? '', /-h 'db host'/)
        assert.match(snippet?.command ?? '', /-u 'app user'/)
        assert.match(snippet?.command ?? '', /'my db'$/)
    })

    it('returns null for unsupported db types', () => {
        assert.equal(buildTerminalCliSnippet(baseConfig({dbType: 'oracle'})), null)
        assert.equal(supportsTerminalCliSnippet('oracle'), false)
        assert.equal(supportsTerminalCliSnippet('mysql'), true)
        assert.equal(supportsTerminalCliSnippet('postgresql'), true)
    })
})
