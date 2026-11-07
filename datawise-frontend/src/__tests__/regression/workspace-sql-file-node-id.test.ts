import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {buildWorkspaceSqlFileNodeId} from '../../features/explorer/services/workspace-sql-file-node-id.ts'

describe('buildWorkspaceSqlFileNodeId', () => {
    it('derives unique ids from connection, instance and file name', () => {
        const left = buildWorkspaceSqlFileNodeId('conn-1', 'admin_db', '智能分群.sql')
        const right = buildWorkspaceSqlFileNodeId('conn-1', 'admin_db', '智能标签.sql')
        assert.notEqual(left, right)
        assert.match(left, /^ws-file-conn_1-admin_db-/)
    })

    it('is stable for the same file name', () => {
        const once = buildWorkspaceSqlFileNodeId('conn-1', 'admin_db', 'Script-1.sql')
        const twice = buildWorkspaceSqlFileNodeId('conn-1', 'admin_db', 'Script-1.sql')
        assert.equal(once, twice)
    })
})
