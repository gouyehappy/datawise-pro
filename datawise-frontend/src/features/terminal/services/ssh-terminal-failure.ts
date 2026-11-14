/**
 * Classify SSH terminal failure messages for reconnect / UX policy.
 * Keep aligned with backend SshConnectionSupport where possible.
 */

export type SshTerminalFailureKind = 'auth' | 'transient' | 'fatal' | 'unknown'

export type SshTerminalFailureClass = {
    kind: SshTerminalFailureKind
    /** Auto-reconnect is allowed only for transient (and unknown with soft policy). */
    shouldAutoReconnect: boolean
}

const AUTH_MARKERS = [
    'auth fail',
    'authentication fail',
    'authentication failed',
    'ssh authentication failed',
    'permission denied',
    'invalid privatekey',
    'invalid private key',
    'too many authentication',
] as const

const TRANSIENT_MARKERS = [
    'connect timed out',
    'connection timed out',
    'timed out',
    'timeout',
    'connection refused',
    'connection reset',
    'broken pipe',
    'no route to host',
    'network is unreachable',
    'websocket closed',
    'websocket connection failed',
    'websocket error after connect',
    'temporarily unavailable',
    'ssh_create_timeout',
    'ssh_ws_error_after_connect',
    'ssh_ws_connect_failed',
    'ssh_ws_closed',
] as const

const FATAL_MARKERS = [
    'handshake rejected',
    'access denied',
    'forbidden',
    'ssh terminal disabled',
    'does not support ssh shell',
    'too many active ssh sessions',
    'missing dw-cli-session-id',
    'not authenticated',
    // Stable bridge error codes (keep in sync with ssh-terminal.bridge.ts)
    'ssh_no_session',
    'ssh_access_denied',
    'ssh_ws_handshake_rejected',
] as const

/** Stable codes returned by createSshTerminalBridge (translated in the pane). */
export const SSH_BRIDGE_ERROR_CODES = {
    NO_SESSION: 'SSH_NO_SESSION',
    CREATE_TIMEOUT: 'SSH_CREATE_TIMEOUT',
    ACCESS_DENIED: 'SSH_ACCESS_DENIED',
    WS_ERROR_AFTER_CONNECT: 'SSH_WS_ERROR_AFTER_CONNECT',
    WS_CONNECT_FAILED: 'SSH_WS_CONNECT_FAILED',
    WS_CLOSED: 'SSH_WS_CLOSED',
    WS_HANDSHAKE_REJECTED: 'SSH_WS_HANDSHAKE_REJECTED',
} as const

export type SshBridgeErrorCode =
    (typeof SSH_BRIDGE_ERROR_CODES)[keyof typeof SSH_BRIDGE_ERROR_CODES]

const SSH_BRIDGE_I18N_KEYS: Record<SshBridgeErrorCode, string> = {
    SSH_NO_SESSION: 'terminal.sshBridgeNoSession',
    SSH_CREATE_TIMEOUT: 'terminal.sshBridgeCreateTimeout',
    SSH_ACCESS_DENIED: 'terminal.sshBridgeAccessDenied',
    SSH_WS_ERROR_AFTER_CONNECT: 'terminal.sshBridgeWsErrorAfterConnect',
    SSH_WS_CONNECT_FAILED: 'terminal.sshBridgeWsConnectFailed',
    SSH_WS_CLOSED: 'terminal.sshBridgeWsClosed',
    SSH_WS_HANDSHAKE_REJECTED: 'terminal.sshBridgeWsHandshakeRejected',
}

export function isSshBridgeErrorCode(value: string | null | undefined): value is SshBridgeErrorCode {
    return !!value && value in SSH_BRIDGE_I18N_KEYS
}

/** Map bridge codes / common transport English to localized copy. */
export function localizeSshTerminalError(
    raw: string | null | undefined,
    translate: (key: string) => string,
    fallbackKey = 'terminal.sshFailed',
): string {
    const trimmed = (raw ?? '').trim()
    if (!trimmed) return translate(fallbackKey)
    if (isSshBridgeErrorCode(trimmed)) {
        return translate(SSH_BRIDGE_I18N_KEYS[trimmed])
    }
    const lower = trimmed.toLowerCase()
    if (lower === 'forbidden' || lower === 'access denied' || lower === 'not authenticated') {
        return translate(SSH_BRIDGE_I18N_KEYS.SSH_ACCESS_DENIED)
    }
    if (lower.includes('websocket connection failed') || lower.includes('websocket error')) {
        return translate(SSH_BRIDGE_I18N_KEYS.SSH_WS_CONNECT_FAILED)
    }
    if (lower.includes('websocket closed')) {
        return translate(SSH_BRIDGE_I18N_KEYS.SSH_WS_CLOSED)
    }
    return trimmed
}

function normalize(message?: string | null): string {
    return (message ?? '').trim().toLowerCase()
}

function includesAny(haystack: string, markers: readonly string[]): boolean {
    return markers.some((marker) => haystack.includes(marker))
}

/** Auth failures should not trigger auto-reconnect loops (JumpServer rate-limits attempts). */
export function isSshAuthFailureMessage(message?: string | null): boolean {
    const lower = normalize(message)
    if (!lower) return false
    // "authentication" alone is noisy; require fail/failed/auth fail/permission denied family.
    if (includesAny(lower, AUTH_MARKERS)) return true
    if (lower.includes('authentication') && lower.includes('fail')) return true
    return false
}

export function isSshTransientFailureMessage(message?: string | null): boolean {
    const lower = normalize(message)
    if (!lower || isSshAuthFailureMessage(lower)) return false
    if (includesAny(lower, FATAL_MARKERS)) return false
    return includesAny(lower, TRANSIENT_MARKERS)
}

export function isSshFatalFailureMessage(message?: string | null): boolean {
    const lower = normalize(message)
    if (!lower || isSshAuthFailureMessage(lower)) return false
    return includesAny(lower, FATAL_MARKERS)
}

export function classifySshTerminalFailure(message?: string | null): SshTerminalFailureClass {
    if (isSshAuthFailureMessage(message)) {
        return {kind: 'auth', shouldAutoReconnect: false}
    }
    if (isSshFatalFailureMessage(message)) {
        return {kind: 'fatal', shouldAutoReconnect: false}
    }
    if (isSshTransientFailureMessage(message)) {
        return {kind: 'transient', shouldAutoReconnect: true}
    }
    // Unknown network-ish drops: allow a bounded retry.
    return {kind: 'unknown', shouldAutoReconnect: true}
}

/** Delay before attempt N (1-based), capped. */
export function sshAutoReconnectDelayMs(attempt: number): number {
    const safe = Math.max(1, attempt)
    return Math.min(15_000, 2_000 * (2 ** (safe - 1)))
}

export const SSH_AUTO_RECONNECT_MAX_ATTEMPTS = 5
