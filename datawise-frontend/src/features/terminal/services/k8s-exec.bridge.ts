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
import {openAuthedWebSocket} from '@/shared/api/http/open-authed-websocket'

type OutputHandler = (data: TerminalOutputChunk) => void
type ExitHandler = (exitCode: number) => void

export type K8sExecTarget = {
    namespace: string
    podName: string
    container?: string
}

interface TerminalWsMessage {
    type: string
    sessionId?: string
    data?: string
    encoding?: string
    ok?: boolean
    error?: string
    code?: string | number
    message?: string
}

const WS_PING_INTERVAL_MS = 20_000
const CREATE_TIMEOUT_MS = 120_000

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

export function createK8sExecBridge(
    connectionId: string,
    target: K8sExecTarget,
    path = '/ws/k8s-exec',
): NativeTerminalBridge {
    const sockets = new Map<string, WebSocket>()
    const outputHandlers = new Map<string, Set<OutputHandler>>()
    const exitHandlers = new Map<string, Set<ExitHandler>>()
    const pingTimers = new Map<string, ReturnType<typeof setInterval>>()
    const intentionalClose = new Set<string>()

    function emitOutput(sessionId: string, data: TerminalOutputChunk) {
        for (const handler of outputHandlers.get(sessionId) ?? []) {
            handler(data)
        }
    }

    function emitExit(sessionId: string, code: number) {
        for (const handler of exitHandlers.get(sessionId) ?? []) {
            handler(code)
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
    }

    return {
        async create(sessionId, opts) {
            ensureHandlers(sessionId)
            intentionalClose.delete(sessionId)
            const authSession = typeof localStorage !== 'undefined'
                ? localStorage.getItem('dw-cli-session-id')
                : null
            if (!authSession) {
                return {
                    ok: false,
                    error: 'Kubernetes exec requires a signed-in session (missing dw-cli-session-id)',
                }
            }
            const socket = openAuthedSocket(resolveWebSocketUrl(path, connectionId))
            sockets.set(sessionId, socket)

            const result = await new Promise<NativeTerminalCreateResult>((resolve) => {
                let settled = false
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
                        error: `Kubernetes exec timed out after ${Math.round(CREATE_TIMEOUT_MS / 1000)}s`,
                    })
                }, CREATE_TIMEOUT_MS)

                socket.addEventListener('open', () => {
                    send(socket, {
                        type: 'create',
                        sessionId,
                        cols: opts?.cols ?? 80,
                        rows: opts?.rows ?? 24,
                        namespace: target.namespace,
                        podName: target.podName,
                        container: target.container ?? '',
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
                            if (message.ok === true) startPing(sessionId, socket)
                            settle({ok: message.ok === true, error: message.error})
                            break
                        case 'output': {
                            const chunk = decodeTerminalWsOutput(message.data, message.encoding)
                            if (chunk) emitOutput(sessionId, chunk)
                            break
                        }
                        case 'exit':
                            stopPing(sessionId)
                            emitExit(sessionId, typeof message.code === 'number' ? message.code : 0)
                            break
                        default:
                            break
                    }
                })

                socket.addEventListener('error', () => {
                    // Browsers omit the real handshake failure; close usually follows with more detail.
                    settle({
                        ok: false,
                        error: 'Kubernetes exec WebSocket error (handshake failed; check /ws/k8s-exec is public and session is valid)',
                    })
                })

                socket.addEventListener('close', (event) => {
                    stopPing(sessionId)
                    sockets.delete(sessionId)
                    if (!settled && !intentionalClose.has(sessionId)) {
                        const reason = event.reason?.trim()
                        const detail = reason
                            ? reason
                            : `code=${event.code}${event.wasClean ? '' : ', unclean'}`
                        settle({ok: false, error: `Kubernetes exec WebSocket closed (${detail})`})
                    }
                })
            })

            if (!result.ok) {
                intentionalClose.add(sessionId)
                try {
                    socket.close()
                } catch {
                    // ignore
                }
                sockets.delete(sessionId)
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
            const socket = sockets.get(sessionId)
            if (!socket || socket.readyState !== WebSocket.OPEN) return false
            send(socket, {type: 'resize', sessionId, cols, rows})
            return true
        },

        async destroy(sessionId) {
            intentionalClose.add(sessionId)
            stopPing(sessionId)
            const socket = sockets.get(sessionId)
            if (socket && socket.readyState === WebSocket.OPEN) {
                send(socket, {type: 'destroy', sessionId})
                try {
                    socket.close()
                } catch {
                    // ignore
                }
            }
            sockets.delete(sessionId)
            return true
        },

        onOutput(sessionId, callback) {
            ensureHandlers(sessionId)
            outputHandlers.get(sessionId)!.add(callback)
            return () => outputHandlers.get(sessionId)?.delete(callback)
        },

        onExit(sessionId, callback) {
            ensureHandlers(sessionId)
            exitHandlers.get(sessionId)!.add(callback)
            return () => exitHandlers.get(sessionId)?.delete(callback)
        },
    }
}
