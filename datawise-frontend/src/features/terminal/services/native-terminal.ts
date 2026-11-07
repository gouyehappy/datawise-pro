import type {NativeTerminalBridge} from '@/features/terminal/services/native-terminal.types'
import {resolveWebSocketTerminalBridge} from '@/features/terminal/services/websocket-terminal.bridge'

let bridgePromise: Promise<NativeTerminalBridge | null> | null = null

export function getNativeTerminalBridge(): NativeTerminalBridge | null {
    if (typeof window === 'undefined') return null
    return window.datawise?.terminal ?? null
}

export async function getTerminalBridge(): Promise<NativeTerminalBridge | null> {
    const desktopBridge = getNativeTerminalBridge()
    if (desktopBridge) return desktopBridge
    if (!bridgePromise) {
        bridgePromise = resolveWebSocketTerminalBridge().finally(() => {
            // Allow retry after transient miss; successful bridge stays in module cache.
            bridgePromise = null
        })
    }
    return bridgePromise
}

export function isNativeTerminalAvailable(): boolean {
    return Boolean(getNativeTerminalBridge())
}

export async function isRealTerminalAvailable(): Promise<boolean> {
    if (isNativeTerminalAvailable()) return true
    return Boolean(await getTerminalBridge())
}
