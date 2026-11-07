import {readDesktopBridge} from '@/features/layout/services/desktop-bridge'

/** Vue 首帧绘制完成：撤开屏遮罩 → 露出 Shell 骨架，并通知 JCEF 聚焦 */
export function notifyDesktopAppMountedAfterPaint(): void {
    if (typeof window === 'undefined') return

    requestAnimationFrame(() => requestAnimationFrame(() => {
        clearOpenScreen()
        markMountedForWatchdog()
        notifyJcefHostMounted()
    }))
}

/** bootstrap 完成 — 通知宿主对齐 AWT（遮罩已在 Shell 首帧撤掉） */
export function notifyDesktopBootReadyAfterPaint(): void {
    if (typeof window === 'undefined') return

    requestAnimationFrame(() => requestAnimationFrame(() => {
        clearOpenScreen()
        notifyJcefHostBootReady()
    }))
}

function clearOpenScreen(): void {
    const clear = (window as Window & {__datawiseClearOpenScreen?: () => void}).__datawiseClearOpenScreen
    if (typeof clear === 'function') {
        clear()
        return
    }
    document.getElementById('dw-open-screen')?.remove()
}

function markMountedForWatchdog(): void {
    const markMounted = (window as Window & {__DW_MARK_MOUNTED__?: () => void}).__DW_MARK_MOUNTED__
    if (typeof markMounted === 'function') {
        markMounted()
        return
    }
    ;(window as Window & {__DW_APP_MOUNTED__?: boolean}).__DW_APP_MOUNTED__ = true
}

function notifyJcefHostMounted(): void {
    const bridge = readDesktopBridge() as {
        app?: {notifyMounted?: () => Promise<unknown>}
    } | undefined

    if (typeof bridge?.app?.notifyMounted === 'function') {
        void bridge.app.notifyMounted().catch(() => invokeNotifyMountedViaCefQuery())
        return
    }

    invokeNotifyMountedViaCefQuery()
}

function notifyJcefHostBootReady(): void {
    const bridge = readDesktopBridge() as {
        app?: {notifyBootReady?: () => Promise<unknown>}
    } | undefined

    if (typeof bridge?.app?.notifyBootReady === 'function') {
        void bridge.app.notifyBootReady().catch(() => invokeNotifyBootReadyViaCefQuery())
        return
    }

    invokeNotifyBootReadyViaCefQuery()
}

function invokeNotifyMountedViaCefQuery(): void {
    invokeDesktopBridgeChannel('app:notifyMounted')
}

function invokeNotifyBootReadyViaCefQuery(): void {
    invokeDesktopBridgeChannel('app:notifyBootReady')
}

function invokeDesktopBridgeChannel(channel: string): void {
    const cefQuery = (window as Window & {
        cefQuery?: (request: {
            request: string
            persistent: boolean
            onSuccess: (response: string) => void
            onFailure: (code: number, msg: string) => void
        }) => void
    }).cefQuery

    if (typeof cefQuery !== 'function') {
        return
    }

    cefQuery({
        request: JSON.stringify({channel, args: []}),
        persistent: false,
        onSuccess: () => {},
        onFailure: () => {},
    })
}
