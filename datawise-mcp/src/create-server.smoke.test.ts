import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, it} from 'node:test'
import {
    API_TOKEN_HEADER,
    createDatawiseMcpServer,
    MCP_TOOL_NAMES,
    MCP_VERSION,
    registeredToolNames,
    SESSION_HEADER,
} from './create-server.js'

describe('datawise-mcp smoke', () => {
    it('package version matches MCP_VERSION', () => {
        const pkg = JSON.parse(
            readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
        ) as {version: string}
        assert.equal(MCP_VERSION, pkg.version)
    })

    it('auth headers use X-DW-* names', () => {
        assert.equal(SESSION_HEADER, 'X-DW-Session-Id')
        assert.equal(API_TOKEN_HEADER, 'X-DW-Api-Token')
    })

    it('registers the full tool catalog', () => {
        const server = createDatawiseMcpServer()
        const registered = registeredToolNames(server)
        assert.deepEqual(registered, [...MCP_TOOL_NAMES].sort())
        assert.equal(MCP_TOOL_NAMES.length, 10)
        assert.ok(MCP_TOOL_NAMES.includes('get_workbench_context'))
        assert.ok(MCP_TOOL_NAMES.includes('propose_open_console'))
        assert.ok(MCP_TOOL_NAMES.includes('execute_readonly_sql'))
        assert.ok(MCP_TOOL_NAMES.includes('review_sql'))
    })
})
