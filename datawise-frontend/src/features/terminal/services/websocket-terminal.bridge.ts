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
import {SSH_BRIDGE_ERROR_CODES} from '@/features/terminal/services/ssh-terminal-failure'

type OutputHandler = (data: TerminalOutputChunk) => void
type ExitHandler = (exitCode: number) => void

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

function resolveWebSocketUrl(path: string): string {
    const configured = readApiBaseUrl()
    if (configured) {
        const protocol = configured.startsWith('https://') ? 'wss://' : 'ws://'
        const host = configured.replace(/^https?:\/\//, '')
        return `${protocol}${host}${path}`
    }
    if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        return `${protocol}//${window.location.host}${path}`
    }
    return `${backendDevBaseUrl('127.0.0.1').replace(/^http/, 'ws')}${path}`
}

/** Prefer Sec-WebSocket-Protocol; never put session ids in the URL. */
function openAuthedSocket(url: string): WebSocket {
    return openAuthedWebSocket(url)
}

export function createWebSocketTerminalBridge(path = '/ws/terminal'): NativeTerminalBridge {
    const sockets = new Map<string, WebSocket>()
    const outputHandlers = new Map<string, Set<OutputHandler>>()
    const exitHandlers = new Map<string, Set<ExitHandler>>()

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

    function ensureHandlers(sessionId: string) {
        if (!outputHandlers.has(sessionId)) outputHandlers.set(sessionId, new Set())
        if (!exitHandlers.has(sessionId)) exitHandlers.set(sessionId, new Set())
    }

    return {
        async create(sessionId, opts) {
            ensureHandlers(sessionId)
            const socket = openAuthedSocket(resolveWebSocketUrl(path))
            sockets.set(sessionId, socket)

            const result = await new Promise<NativeTerminalCreateResult>((resolve) => {
                let settled = false
                const settle = (value: NativeTerminalCreateResult) => {
                    if (settled) return
                    settled = true
                    resolve(value)
                }

                socket.addEventListener('open', () => {
                    send(socket, {
                        type: 'create',
                        sessionId,
                        cols: opts?.cols ?? 80,
                        rows: opts?.rows ?? 24,
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
                        case 'exit':
                            emitExit(sessionId, typeof message.code === 'number' ? message.code : 0)
                            break
                        case 'error':
                            if (message.code === 'FORBIDDEN') {
                                settle({
                                    ok: false,
                                    error: message.message || SSH_BRIDGE_ERROR_CODES.ACCESS_DENIED,
                                })
                                socket.close()
                                emitExit(sessionId, 1)
                            }
                            break
                    }
                })

                socket.addEventListener('error', () => {
                    settle({ok: false, error: SSH_BRIDGE_ERROR_CODES.WS_CONNECT_FAILED})
                })

                socket.addEventListener('close', () => {
                    settle({ok: false, error: SSH_BRIDGE_ERROR_CODES.WS_CLOSED})
                    emitExit(sessionId, 0)
                })
            })

            if (!result.ok) {
                sockets.delete(sessionId)
                try {
                    socket.close()
                } catch {
                    // ignore
                }
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
            const socket = sockets.get(sessionId)
            if (socket) {
                send(socket, {type: 'destroy', sessionId})
                socket.close()
                sockets.delete(sessionId)
            }
            outputHandlers.delete(sessionId)
            exitHandlers.delete(sessionId)
            return true
        },

        onOutput(sessionId, callback) {
            ensureHandlers(sessionId)
            outputHandlers.get(sessionId)?.add(callback)
            return () => outputHandlers.get(sessionId)?.delete(callback)
        },

        onExit(sessionId, callback) {
            ensureHandlers(sessionId)
            exitHandlers.get(sessionId)?.add(callback)
            return () => exitHandlers.get(sessionId)?.delete(callback)
        },
    }
}

let cachedBridge: NativeTerminalBridge | null | undefined
let cachedStatus: {ptyAvailable: boolean; path: string} | null = null
let negativeCacheUntil = 0

export async function resolveWebSocketTerminalBridge(): Promise<NativeTerminalBridge | null> {
    if (cachedBridge) return cachedBridge
    if (typeof window === 'undefined' || window.datawise?.terminal) {
        cachedBridge = null
        return null
    }
    // Avoid sticky failure while backend / session is still starting (packaged desktop).
    if (cachedBridge === null && Date.now() < negativeCacheUntil) {
        return null
    }
    try {
        const {terminalApi} = await import('@/api')
        const status = await terminalApi.status()
        cachedStatus = {ptyAvailable: status.ptyAvailable, path: status.websocketPath}
        if (!status.websocketEnabled || !status.ptyAvailable) {
            cachedBridge = null
            // Config says off — cache longer; avoid hammering.
            negativeCacheUntil = Date.now() + 30_000
            return null
        }
        cachedBridge = createWebSocketTerminalBridge(status.websocketPath)
        negativeCacheUntil = 0
        return cachedBridge
    } catch {
        cachedBridge = null
        cachedStatus = null
        // Transient API / auth failure — retry soon.
        negativeCacheUntil = Date.now() + 2_000
        return null
    }
}

export function resetWebSocketTerminalBridgeCache(): void {
    cachedBridge = undefined
    cachedStatus = null
    negativeCacheUntil = 0
}

export function getCachedWebSocketTerminalStatus() {
    return cachedStatus
}
