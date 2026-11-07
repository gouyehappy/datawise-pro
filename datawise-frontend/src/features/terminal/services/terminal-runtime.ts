import {isNativeTerminalAvailable, isRealTerminalAvailable} from '@/features/terminal/services/native-terminal'
import {getCachedWebSocketTerminalStatus} from '@/features/terminal/services/websocket-terminal.bridge'

export type TerminalRuntimeMode = 'native' | 'demo'

/** Sync snapshot: native host terminal bridge, or already-resolved WebSocket PTY. */
export function getTerminalRuntimeMode(): TerminalRuntimeMode {
    if (isNativeTerminalAvailable()) return 'native'
    const status = getCachedWebSocketTerminalStatus()
    if (status?.ptyAvailable) return 'native'
    return 'demo'
}

/** Prefer this after mount — probes `/api/terminal/status` when needed. */
export async function resolveTerminalRuntimeMode(): Promise<TerminalRuntimeMode> {
    if (isNativeTerminalAvailable()) return 'native'
    if (await isRealTerminalAvailable()) return 'native'
    return 'demo'
}

export function resolveHostPlatform(): string {
    if (typeof window !== 'undefined' && window.datawise?.platform) {
        return window.datawise.platform
    }
    return typeof navigator !== 'undefined' ? navigator.platform : 'web'
}

/** Matches desktop TerminalService resolveShell() defaults for UI labels. */
export function defaultNativeShellLabel(platform = resolveHostPlatform()): string {
    const normalized = platform.toLowerCase()
    if (normalized.startsWith('win')) {
        return 'powershell.exe'
    }
    return '/bin/bash'
}
