/** Host 注入的只读桌面桥（JCEF）；渲染进程组装 window.datawise 前可用 */
export function readDesktopBridge(): Window['__datawiseDesktopBridge'] | undefined {
    if (typeof window === 'undefined') return undefined
    return window.__datawiseDesktopBridge
}

/** 桌面桥或已组装的 window.datawise（含 plugin hooks） */
export function readDatawiseHost(): NonNullable<Window['datawise']> | undefined {
    if (typeof window === 'undefined') return undefined
    return window.datawise ?? readDesktopBridge()
}

/**
 * True only for a real desktop shell (JCEF host bridge or native host APIs).
 * Web always installs a thin `window.datawise` stub for plugin hooks (`platform: 'web'`);
 * that must not be treated as desktop or boot stays on the desktop skeleton forever in e2e/dev.
 */
export function isNativeDesktopHost(): boolean {
    if (typeof window === 'undefined') return false
    if (readDesktopBridge()) return true
    const host = window.datawise
    if (!host) return false
    if (host.chrome || host.fs || host.terminal) return true
    if (host.isPackaged === true) return true
    if (host.splash?.getMeta?.()?.isPackaged === true) return true
    const platform = host.platform?.trim().toLowerCase()
    return Boolean(platform && platform !== 'web')
}
