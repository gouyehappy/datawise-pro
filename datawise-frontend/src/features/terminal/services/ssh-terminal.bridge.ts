import type {
    NativeTerminalBridge,
    NativeTerminalCreateResult,
    TerminalOutputChunk,
} from '@/features/terminal/services/native-terminal.types'
import {readApiBaseUrl} from '@/shared/api/mode'
import {backendDevBaseUrl} from '@/shared/config/runtime-ports'
import {
    decodeTerminalWsOutput,
    normalizePtyInput,
} from '@/features/terminal/services/terminal-ws-codec'
import {SSH_BRIDGE_ERROR_CODES} from '@/features/terminal/services/ssh-terminal-failure'
import {openAuthedWebSocket} from '@/shared/api/http/open-authed-websocket'

export {normalizePtyInput} from '@/features/terminal/services/terminal-ws-codec'

type OutputHandler = (data: TerminalOutputChunk) => void
type ExitHandler = (exitCode: number) => void
type DropHandler = () => void
type ResumeHandler = () => void

interface TerminalWsMessage {
    type: string
    sessionId?: string
    data?: string
    encoding?: string
    ok?: boolean
    resumed?: boolean
    error?: string
    code?: string | number
    message?: string
}

/** Keep the browser ↔ backend WebSocket alive across idle proxies/NATs. */
const WS_PING_INTERVAL_MS = 20_000
/** Soft ceiling for WS open + backend SSH session/shell create (2x JSch connect + retry). */
const CREATE_TIMEOUT_MS = 120_000
/** Match backend default resumeGraceMs (15s) with budget for reconnect attempts. */
const RESUME_BUDGET_MS = 12_000
const RESUME_GAP_MS = 500

function resolveWebSocketUrl(path: string, connectionId: string): string {
    const params = new URLSearchParams()
    params.set('connectionId', connectionId)
    const query = `?${params.toString()}`
    const configured = readApiBaseUrl()
    if (configured) {
        const protocol = configured.startsWith('https://') ? 'wss://' : 'ws://'
        const host = configured.replace(/^https?:\/\//, '')
        return `${protocol}${host}${path}${query}`
    }
    if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        return `${protocol}//${window.location.host}${path}${query}`
    }
    return `${backendDevBaseUrl('127.0.0.1').replace(/^http/, 'ws')}${path}${query}`
}

function openAuthedSocket(url: string): WebSocket {
    return openAuthedWebSocket(url)
}

function chunkCharLength(chunk: TerminalOutputChunk): number {
    return typeof chunk === 'string' ? chunk.length : chunk.length
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export type SshTerminalBridge = NativeTerminalBridge & {
    isOpen: (sessionId: string) => boolean
    /** Soft-reattach same sessionId without tearing down handlers (WS short-drop resume). */
    resume: (sessionId: string, opts?: {cols?: number; rows?: number}) => Promise<NativeTerminalCreateResult>
    onTransportDrop: (sessionId: string, callback: DropHandler) => () => void
    onTransportResume: (sessionId: string, callback: ResumeHandler) => () => void
}

export function createSshTerminalBridge(
    connectionId: string,
    path = '/ws/ssh-shell',
): SshTerminalBridge {
    const sockets = new Map<string, WebSocket>()
    const outputHandlers = new Map<string, Set<OutputHandler>>()
    const exitHandlers = new Map<string, Set<ExitHandler>>()
    const dropHandlers = new Map<string, Set<DropHandler>>()
    const resumeHandlers = new Map<string, Set<ResumeHandler>>()
    const outputBuffers = new Map<string, TerminalOutputChunk[]>()
    const pingTimers = new Map<string, ReturnType<typeof setInterval>>()
    const intentionalClose = new Set<string>()
    const established = new Set<string>()
    const resuming = new Set<string>()
    const lastSize = new Map<string, {cols: number; rows: number}>()
    const OUTPUT_BUFFER_MAX_CHUNKS = 200
    const OUTPUT_BUFFER_MAX_CHARS = 256_000

    function pushBufferedOutput(sessionId: string, data: TerminalOutputChunk) {
        const buffer = outputBuffers.get(sessionId) ?? []
        buffer.push(data)
        while (buffer.length > OUTPUT_BUFFER_MAX_CHUNKS) {
            buffer.shift()
        }
        let totalChars = 0
        for (let i = buffer.length - 1; i >= 0; i -= 1) {
            totalChars += chunkCharLength(buffer[i]!)
            if (totalChars > OUTPUT_BUFFER_MAX_CHARS) {
                buffer.splice(0, i)
                break
            }
        }
        outputBuffers.set(sessionId, buffer)
    }

    function emitOutput(sessionId: string, data: TerminalOutputChunk) {
        const handlers = outputHandlers.get(sessionId)
        if (!handlers?.size) {
            pushBufferedOutput(sessionId, data)
            return
        }
        for (const handler of handlers) {
            handler(data)
        }
    }

    function emitExit(sessionId: string, code: number) {
        established.delete(sessionId)
        for (const handler of exitHandlers.get(sessionId) ?? []) {
            handler(code)
        }
    }

    function emitDrop(sessionId: string) {
        for (const handler of dropHandlers.get(sessionId) ?? []) {
            handler()
        }
    }

    function emitResume(sessionId: string) {
        for (const handler of resumeHandlers.get(sessionId) ?? []) {
            handler()
        }
    }

    function send(socket: WebSocket, payload: Record<string, unknown>) {
        if (socket.readyState !== WebSocket.OPEN) return
        socket.send(JSON.stringify(payload))
    }

    function stopPing(sessionId: string) {
        const timer = pingTimers.get(sessionId)
        if (timer) {
            clearInterval(timer)
            pingTimers.delete(sessionId)
        }
    }

    function startPing(sessionId: string, socket: WebSocket) {
        stopPing(sessionId)
        pingTimers.set(
            sessionId,
            setInterval(() => {
                if (socket.readyState !== WebSocket.OPEN) {
                    stopPing(sessionId)
                    return
                }
                send(socket, {type: 'ping', sessionId})
            }, WS_PING_INTERVAL_MS),
        )
    }

    function ensureHandlers(sessionId: string) {
        if (!outputHandlers.has(sessionId)) outputHandlers.set(sessionId, new Set())
        if (!exitHandlers.has(sessionId)) exitHandlers.set(sessionId, new Set())
        if (!dropHandlers.has(sessionId)) dropHandlers.set(sessionId, new Set())
        if (!resumeHandlers.has(sessionId)) resumeHandlers.set(sessionId, new Set())
    }

    function rememberSize(sessionId: string, cols?: number, rows?: number) {
        lastSize.set(sessionId, {
            cols: cols ?? lastSize.get(sessionId)?.cols ?? 80,
            rows: rows ?? lastSize.get(sessionId)?.rows ?? 24,
        })
    }

    function openCreate(
        sessionId: string,
        opts?: {cols?: number; rows?: number},
    ): Promise<NativeTerminalCreateResult> {
        ensureHandlers(sessionId)
        intentionalClose.delete(sessionId)
        const authSession = typeof localStorage !== 'undefined'
            ? localStorage.getItem('dw-cli-session-id')
            : null
        if (!authSession) {
            return Promise.resolve({
                ok: false,
                error: SSH_BRIDGE_ERROR_CODES.NO_SESSION,
            })
        }
        rememberSize(sessionId, opts?.cols, opts?.rows)
        const size = lastSize.get(sessionId)!
        const socket = openAuthedSocket(resolveWebSocketUrl(path, connectionId))
        sockets.set(sessionId, socket)

        return new Promise<NativeTerminalCreateResult>((resolve) => {
            let settled = false
            let opened = false
            let timeoutId: ReturnType<typeof setTimeout> | null = null
            const settle = (value: NativeTerminalCreateResult) => {
                if (settled) return
                settled = true
                if (timeoutId) {
                    clearTimeout(timeoutId)
                    timeoutId = null
                }
                resolve(value)
            }

            timeoutId = setTimeout(() => {
                intentionalClose.add(sessionId)
                try {
                    socket.close()
                } catch {
                    // ignore
                }
                settle({
                    ok: false,
                    error: SSH_BRIDGE_ERROR_CODES.CREATE_TIMEOUT,
                })
            }, CREATE_TIMEOUT_MS)

            socket.addEventListener('open', () => {
                opened = true
                send(socket, {
                    type: 'create',
                    sessionId,
                    cols: size.cols,
                    rows: size.rows,
                })
            })

            socket.addEventListener('message', (event) => {
                let message: TerminalWsMessage
                try {
                    message = JSON.parse(String(event.data)) as TerminalWsMessage
                } catch {
                    return
                }
                if (message.sessionId !== sessionId) return

                switch (message.type) {
                    case 'created':
                        if (message.ok === true) {
                            established.add(sessionId)
                            startPing(sessionId, socket)
                        }
                        settle({
                            ok: message.ok === true,
                            error: message.error,
                        })
                        break
                    case 'output': {
                        const chunk = decodeTerminalWsOutput(message.data, message.encoding)
                        if (chunk) emitOutput(sessionId, chunk)
                        break
                    }
                    case 'pong':
                        break
                    case 'exit':
                        stopPing(sessionId)
                        emitExit(sessionId, typeof message.code === 'number' ? message.code : 0)
                        break
                    case 'error':
                        if (message.code !== 'FORBIDDEN') break
                        if (!settled) {
                            intentionalClose.add(sessionId)
                            stopPing(sessionId)
                            try {
                                socket.close()
                            } catch {
                                // ignore
                            }
                            settle({
                                ok: false,
                                error: message.message?.trim() || SSH_BRIDGE_ERROR_CODES.ACCESS_DENIED,
                            })
                        }
                        break
                }
            })

            socket.addEventListener('error', () => {
                settle({
                    ok: false,
                    error: opened
                        ? SSH_BRIDGE_ERROR_CODES.WS_ERROR_AFTER_CONNECT
                        : SSH_BRIDGE_ERROR_CODES.WS_CONNECT_FAILED,
                })
            })

            socket.addEventListener('close', (event) => {
                stopPing(sessionId)
                const wasIntentional = intentionalClose.has(sessionId)
                intentionalClose.delete(sessionId)
                sockets.delete(sessionId)
                const wasEstablished = established.has(sessionId)
                if (wasEstablished) {
                    established.delete(sessionId)
                }

                if (!wasIntentional && wasEstablished) {
                    emitDrop(sessionId)
                    void tryAutoResume(sessionId)
                } else if (!wasIntentional && settled) {
                    // Create never succeeded, or already failed — surface as exit only if settled ok path missed.
                }

                if (opened) {
                    settle({ok: false, error: SSH_BRIDGE_ERROR_CODES.WS_CLOSED})
                    return
                }
                const code = typeof event === 'object' && event && 'code' in event
                    ? Number((event as CloseEvent).code)
                    : 0
                settle({
                    ok: false,
                    error: code === 1006 || code === 1002 || code === 1003
                        ? SSH_BRIDGE_ERROR_CODES.WS_HANDSHAKE_REJECTED
                        : SSH_BRIDGE_ERROR_CODES.WS_CONNECT_FAILED,
                })
            })
        })
    }

    async function tryAutoResume(sessionId: string) {
        if (intentionalClose.has(sessionId) || resuming.has(sessionId)) {
            return
        }
        resuming.add(sessionId)
        const started = Date.now()
        let attempt = 0
        try {
            while (Date.now() - started < RESUME_BUDGET_MS) {
                if (intentionalClose.has(sessionId)) {
                    return
                }
                attempt += 1
                if (attempt > 1) {
                    await sleep(RESUME_GAP_MS)
                }
                const size = lastSize.get(sessionId)
                const result = await openCreate(sessionId, size)
                if (result.ok) {
                    emitResume(sessionId)
                    return
                }
            }
            emitExit(sessionId, 0)
        } finally {
            resuming.delete(sessionId)
        }
    }

    async function waitForResumeLock(sessionId: string): Promise<void> {
        const deadline = Date.now() + RESUME_BUDGET_MS
        while (resuming.has(sessionId) && Date.now() < deadline) {
            await sleep(80)
        }
    }

    return {
        async create(sessionId, opts) {
            await waitForResumeLock(sessionId)
            const result = await openCreate(sessionId, opts)
            if (result.ok) {
                emitResume(sessionId)
            }
            return result
        },

        async resume(sessionId, opts) {
            if (sockets.get(sessionId)?.readyState === WebSocket.OPEN) {
                return {ok: true}
            }
            await waitForResumeLock(sessionId)
            if (sockets.get(sessionId)?.readyState === WebSocket.OPEN) {
                return {ok: true}
            }
            const result = await openCreate(sessionId, opts ?? lastSize.get(sessionId))
            if (result.ok) {
                emitResume(sessionId)
            }
            return result
        },

        async write(sessionId, data) {
            const socket = sockets.get(sessionId)
            if (!socket || socket.readyState !== WebSocket.OPEN) return false
            send(socket, {type: 'write', sessionId, data: normalizePtyInput(data)})
            return true
        },

        async resize(sessionId, cols, rows) {
            rememberSize(sessionId, cols, rows)
            const socket = sockets.get(sessionId)
            if (!socket || socket.readyState !== WebSocket.OPEN) return false
            send(socket, {type: 'resize', sessionId, cols, rows})
            return true
        },

        async destroy(sessionId) {
            const socket = sockets.get(sessionId)
            // Mark before close so the async 'close' event does not look like a drop.
            intentionalClose.add(sessionId)
            established.delete(sessionId)
            stopPing(sessionId)
            outputHandlers.delete(sessionId)
            exitHandlers.delete(sessionId)
            dropHandlers.delete(sessionId)
            resumeHandlers.delete(sessionId)
            outputBuffers.delete(sessionId)
            lastSize.delete(sessionId)
            sockets.delete(sessionId)
            if (socket) {
                send(socket, {type: 'destroy', sessionId})
                socket.close()
            } else {
                intentionalClose.delete(sessionId)
            }
            return true
        },

        isOpen(sessionId) {
            const socket = sockets.get(sessionId)
            return socket?.readyState === WebSocket.OPEN
        },

        onOutput(sessionId, callback) {
            ensureHandlers(sessionId)
            outputHandlers.get(sessionId)?.add(callback)
            const buffered = outputBuffers.get(sessionId)
            if (buffered?.length) {
                for (const chunk of buffered) {
                    callback(chunk)
                }
                outputBuffers.delete(sessionId)
            }
            return () => outputHandlers.get(sessionId)?.delete(callback)
        },

        onExit(sessionId, callback) {
            ensureHandlers(sessionId)
            exitHandlers.get(sessionId)?.add(callback)
            return () => exitHandlers.get(sessionId)?.delete(callback)
        },

        onTransportDrop(sessionId, callback) {
            ensureHandlers(sessionId)
            dropHandlers.get(sessionId)?.add(callback)
            return () => dropHandlers.get(sessionId)?.delete(callback)
        },

        onTransportResume(sessionId, callback) {
            ensureHandlers(sessionId)
            resumeHandlers.get(sessionId)?.add(callback)
            return () => resumeHandlers.get(sessionId)?.delete(callback)
        },
    }
}
