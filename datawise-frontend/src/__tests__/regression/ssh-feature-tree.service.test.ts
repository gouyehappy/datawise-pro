import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildSshConnectionFeatureChildren,
    buildSshScriptRecordMenuItems,
    buildSshScriptRecordsMenuItems,
    buildSshTerminalMenuItems,
    ensureSshConnectionFeatureChildren,
    parseSshScriptRecordId,
    parseSshTerminalConnectionId,
    sshScriptRecordNodeId,
} from '@/features/explorer/services/ssh-feature-tree.service'

const t = ((key: string) => key) as never

describe('ssh-feature-tree.service', () => {
    it('builds terminal and script-records children', () => {
        const children = buildSshConnectionFeatureChildren('ssh-1')
        assert.equal(children.length, 2)
        assert.equal(children[0]?.type, 'ssh-terminal')
        assert.equal(children[0]?.id, 'ssh-1:ssh-terminal')
        assert.equal(children[1]?.type, 'ssh-script-records')
    })

    it('injects ssh children once', () => {
        const connection = {
            id: 'ssh-1',
            label: 'SSH@host',
            type: 'connection' as const,
            dbType: 'ssh' as const,
        }
        ensureSshConnectionFeatureChildren(connection)
        assert.equal(connection.children?.length, 2)
        ensureSshConnectionFeatureChildren(connection)
        assert.equal(connection.children?.length, 2)
    })

    it('parses script record id from node', () => {
        const nodeId = sshScriptRecordNodeId('ssh-1', 'record-1')
        assert.equal(parseSshScriptRecordId({type: 'ssh-script-record', id: nodeId}), 'record-1')
    })

    it('parses ssh terminal connection id', () => {
        assert.equal(parseSshTerminalConnectionId('ssh-1:ssh-terminal'), 'ssh-1')
        assert.equal(parseSshTerminalConnectionId('ssh-1'), null)
        assert.equal(parseSshTerminalConnectionId(':ssh-terminal'), null)
    })

    it('builds ssh context menus with stable action ids', () => {
        assert.deepEqual(
            buildSshScriptRecordsMenuItems(t).map((item) => item.id),
            ['new-ssh-script-record', 'refresh-ssh-script-records', 'divider-1', 'copy-name'],
        )
        assert.deepEqual(
            buildSshScriptRecordMenuItems(t).map((item) => item.id),
            ['open', 'rename-ssh-script-record', 'delete-ssh-script-record', 'divider-1', 'copy-name'],
        )
        assert.deepEqual(
            buildSshTerminalMenuItems(t).map((item) => item.id),
            ['open', 'new-ssh-terminal', 'copy-name'],
        )
    })
})
