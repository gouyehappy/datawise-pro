export type SshTerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export {
    classifySshTerminalFailure,
    isSshAuthFailureMessage,
    isSshFatalFailureMessage,
    isSshTransientFailureMessage,
    sshAutoReconnectDelayMs,
    SSH_AUTO_RECONNECT_MAX_ATTEMPTS,
    type SshTerminalFailureClass,
    type SshTerminalFailureKind,
} from '@/features/terminal/services/ssh-terminal-failure'

export interface SshTerminalHandle {
    tabId: string
    connectionId: string
    label: string
    sendInput: (text: string) => Promise<boolean>
    focus: () => void
    getStatus: () => SshTerminalStatus
    reconnect: () => Promise<void>
    /**
     * Tear down the remote shell while keeping the KeepAlive pane + handle registered
     * (idle disconnect / explorer reconnect overlay). Status becomes disconnected.
     */
    suspend?: () => void | Promise<void>
    /** Release remote shell + WebSocket (e.g. tab closed while KeepAlive still caches the pane). */
    dispose?: () => void | Promise<void>
}

const handles = new Map<string, SshTerminalHandle>()

export function registerSshTerminalHandle(handle: SshTerminalHandle): void {
    handles.set(handle.tabId, handle)
}

export function unregisterSshTerminalHandle(tabId: string): void {
    handles.delete(tabId)
}

/** Drop handle and tear down shell when a workspace tab is closed (KeepAlive may skip onUnmounted). */
export async function disposeSshTerminalHandle(tabId: string): Promise<void> {
    const handle = handles.get(tabId)
    handles.delete(tabId)
    if (!handle?.dispose) return
    try {
        await handle.dispose()
    } catch {
        // best-effort cleanup
    }
}

export function listSshTerminalHandles(connectionId: string): SshTerminalHandle[] {
    return [...handles.values()].filter((item) => item.connectionId === connectionId)
}

/**
 * Suspend interactive shells for a connection (idle disconnect / manual disconnect).
 * Keeps handles registered so a later explorer reconnect can revive the KeepAlive panes.
 */
export async function disposeSshTerminalsForConnection(connectionId: string): Promise<void> {
    if (!connectionId) return
    const targets = listSshTerminalHandles(connectionId)
    await Promise.all(
        targets.map(async (handle) => {
            try {
                if (handle.suspend) {
                    await handle.suspend()
                    return
                }
                // Legacy handles without suspend: full dispose (unregisters).
                await disposeSshTerminalHandle(handle.tabId)
            } catch {
                // best-effort cleanup
            }
        }),
    )
}

/** Recreate suspended shells after the explorer connection is back (idle overlay). */
export async function reconnectSshTerminalsForConnection(connectionId: string): Promise<void> {
    if (!connectionId) return
    const targets = listSshTerminalHandles(connectionId)
    await Promise.all(
        targets.map(async (handle) => {
            const status = handle.getStatus()
            // Leave healthy / in-flight sessions alone (tree connect must not bounce a live shell).
            if (status === 'connected' || status === 'connecting') return
            try {
                await handle.reconnect()
            } catch {
                // best-effort revive
            }
        }),
    )
}

export function getSshTerminalHandle(tabId: string): SshTerminalHandle | null {
    return handles.get(tabId) ?? null
}

export function findSshTerminalHandle(
    connectionId: string,
    preferTabId?: string,
): SshTerminalHandle | null {
    if (preferTabId) {
        const preferred = handles.get(preferTabId)
        if (preferred?.connectionId === connectionId) {
            return preferred
        }
    }
    const candidates = listSshTerminalHandles(connectionId)
    const connected = candidates.find((item) => item.getStatus() === 'connected')
    return connected ?? candidates[0] ?? null
}

export async function sendToSshTerminal(
    connectionId: string,
    text: string,
    options?: {appendNewline?: boolean; preferTabId?: string; focus?: boolean},
): Promise<boolean> {
    const trimmed = text.trim()
    if (!trimmed) return false
    const handle = findSshTerminalHandle(connectionId, options?.preferTabId)
    if (!handle) return false
    if (handle.getStatus() !== 'connected') {
        await handle.reconnect()
    }
    const payload = options?.appendNewline === false ? trimmed : `${trimmed}\n`
    const ok = await handle.sendInput(payload)
    if (ok && options?.focus !== false) {
        handle.focus()
    }
    return ok
}

export function formatSshEndpoint(user?: string, host?: string, port?: string): string {
    const endpoint = host?.trim() || ''
    if (!endpoint) return ''
    const portPart = port?.trim() ? `:${port.trim()}` : ''
    const userPart = user?.trim() ? `${user.trim()}@` : ''
    return `${userPart}${endpoint}${portPart}`
}
