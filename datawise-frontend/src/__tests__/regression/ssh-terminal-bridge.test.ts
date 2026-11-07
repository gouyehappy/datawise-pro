import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    createSshTerminalBridge,
    normalizePtyInput,
} from '@/features/terminal/services/ssh-terminal.bridge'

type WsHandler = (event: {data: string}) => void

function installMockWebSocket(options?: {
    onCreate?: (sessionId: string, emit: (payload: unknown) => void) => void
}) {
    const originalWebSocket = globalThis.WebSocket
    const listeners = new Map<string, Set<WsHandler>>()
    const sent: string[] = []

    function emitMessage(payload: unknown) {
        const data = JSON.stringify(payload)
        for (const handler of listeners.get('message') ?? []) {
            handler({data})
        }
    }

    class MockWebSocket {
        static OPEN = 1
        readyState = MockWebSocket.OPEN

        constructor(_url?: string, _protocols?: string | string[]) {}

        addEventListener(type: string, handler: WsHandler) {
            const bucket = listeners.get(type) ?? new Set()
            bucket.add(handler)
            listeners.set(type, bucket)
            if (type === 'open') {
                queueMicrotask(() => handler({data: ''}))
            }
        }

        send(payload: string) {
            sent.push(payload)
            let message: {type?: string; sessionId?: string}
            try {
                message = JSON.parse(payload) as {type?: string; sessionId?: string}
            } catch {
                return
            }
            if (message.type === 'create' && message.sessionId) {
                const sessionId = message.sessionId
                queueMicrotask(() => {
                    if (options?.onCreate) {
                        options.onCreate(sessionId, emitMessage)
                        return
                    }
                    emitMessage({type: 'created', sessionId, ok: true})
                })
            }
        }

        close() {}
    }

    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: {
            getItem: (key: string) => (key === 'dw-cli-session-id' ? 'test-session' : null),
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
            key: () => null,
            length: 0,
        } as Storage,
    })

    return {
        sent,
        emitMessage,
        restore() {
            globalThis.WebSocket = originalWebSocket
        },
    }
}

describe('ssh-terminal.bridge', () => {
    it('normalizes paste newlines to CR for PTY', () => {
        assert.equal(normalizePtyInput('a\r\nb\nc'), 'a\rb\rc')
        assert.equal(normalizePtyInput('single'), 'single')
    })

    it('buffers early shell output until onOutput subscribes', async () => {
        const mock = installMockWebSocket({
            onCreate(sessionId, emit) {
                emit({type: 'output', sessionId, data: 'root@host:~# '})
                emit({type: 'created', sessionId, ok: true})
            },
        })
        try {
            const bridge = createSshTerminalBridge('conn-1')
            const sessionId = 'session-1'
            const created = await bridge.create(sessionId, {cols: 120, rows: 30})
            assert.equal(created.ok, true)

            const chunks: Array<string | Uint8Array> = []
            bridge.onOutput(sessionId, (data) => chunks.push(data))
            assert.deepEqual(chunks, ['root@host:~# '])

            const ok = await bridge.write(sessionId, 'echo hi\n')
            assert.equal(ok, true)
            const writePayload = JSON.parse(
                mock.sent.find((item) => item.includes('"write"')) ?? '{}',
            ) as {data?: string}
            assert.equal(writePayload.data, 'echo hi\r')

            await bridge.destroy(sessionId)
        } finally {
            mock.restore()
        }
    })

    it('decodes base64 output into Uint8Array for xterm', async () => {
        const mock = installMockWebSocket()
        try {
            const bridge = createSshTerminalBridge('conn-1')
            const sessionId = 'session-b64'
            assert.equal((await bridge.create(sessionId, {cols: 80, rows: 24})).ok, true)

            const chunks: Array<string | Uint8Array> = []
            bridge.onOutput(sessionId, (data) => chunks.push(data))

            const text = '中文'
            const b64 = Buffer.from(text, 'utf8').toString('base64')
            mock.emitMessage({
                type: 'output',
                sessionId,
                encoding: 'base64',
                data: b64,
            })

            assert.equal(chunks.length, 1)
            assert.ok(chunks[0] instanceof Uint8Array)
            assert.equal(Buffer.from(chunks[0] as Uint8Array).toString('utf8'), text)
            await bridge.destroy(sessionId)
        } finally {
            mock.restore()
        }
    })
})
