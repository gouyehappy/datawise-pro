import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {htmlToPlainText} from '@/features/ssh/services/ssh-html-text.service'
import {
    appendTerminalOutputToRecordHtml,
    terminalOutputToRecordHtml,
} from '@/features/ssh/services/ssh-terminal-snippet.service'
import {
    formatSshEndpoint,
    registerSshTerminalHandle,
    unregisterSshTerminalHandle,
    disposeSshTerminalsForConnection,
    reconnectSshTerminalsForConnection,
    listSshTerminalHandles,
    type SshTerminalStatus,
} from '@/features/terminal/services/ssh-terminal-session.service'
import {buildSshTerminalContextMenu} from '@/features/terminal/constants/ssh-terminal-context-menu'

const t = ((key: string) => key) as never

describe('ssh-html-text.service', () => {
    it('strips html to plain text', () => {
        const text = htmlToPlainText('<p>hello</p><pre>ls -la</pre>')
        assert.ok(text.includes('hello'))
        assert.ok(text.includes('ls -la'))
    })
})

describe('ssh-terminal-snippet.service', () => {
    it('wraps terminal output in pre block', () => {
        const html = terminalOutputToRecordHtml('ls -la\n')
        assert.ok(html.includes('ls -la'))
        // Stored as plain text (legacy HTML wrapper removed)
        assert.equal(html.includes('<pre>'), false)
    })

    it('appends terminal output to existing html', () => {
        const html = appendTerminalOutputToRecordHtml('<p>note</p>', 'pwd')
        assert.ok(html.includes('note'))
        assert.ok(html.includes('pwd'))
    })
})

describe('ssh-terminal-context-menu', () => {
    it('includes append submenu when records exist', () => {
        const items = buildSshTerminalContextMenu(t, {
            hasSelection: true,
            records: [{id: 'r1', title: 'Deploy', contentHtml: '', updatedAt: 0}],
        })
        const append = items.find((item) => item.id === 'append-record-submenu')
        assert.ok(append?.children?.some((child) => child.id === 'append-record:r1'))
    })
})

describe('ssh-terminal-session.service', () => {
    it('formats ssh endpoint', () => {
        assert.equal(formatSshEndpoint('root', '10.0.0.1', '2222'), 'root@10.0.0.1:2222')
    })

    it('suspends shells on idle without unregistering, then reconnects', async () => {
        const tabId = 'ssh-tab-idle'
        let status: SshTerminalStatus = 'connected'
        let reconnectCalls = 0
        let suspendCalls = 0
        registerSshTerminalHandle({
            tabId,
            connectionId: 'conn-ssh',
            label: 'SSH',
            sendInput: async () => true,
            focus: () => undefined,
            getStatus: () => status,
            reconnect: async () => {
                reconnectCalls += 1
                status = 'connected'
            },
            suspend: async () => {
                suspendCalls += 1
                status = 'disconnected'
            },
            dispose: async () => {
                status = 'disconnected'
            },
        })
        try {
            await disposeSshTerminalsForConnection('conn-ssh')
            assert.equal(suspendCalls, 1)
            assert.equal(listSshTerminalHandles('conn-ssh').length, 1)
            assert.equal(status, 'disconnected')

            await reconnectSshTerminalsForConnection('conn-ssh')
            assert.equal(reconnectCalls, 1)
            assert.equal(status, 'connected')
        } finally {
            unregisterSshTerminalHandle(tabId)
        }
    })
})
