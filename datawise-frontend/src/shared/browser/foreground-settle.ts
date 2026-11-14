/**
 * 前台恢复稳态：桌面 JCEF / Chromium 在 Alt+Tab、任务栏切回时，
 * 常先有一帧 hidden 布局或 clientHeight=0。虚拟列表与聚焦刷新应统一走这里，
 * 而不是各业务自己 setTimeout / 特判。
 */

export type ViewportSample = {
    scrollTop: number
    viewportHeight: number
}

export function isDocumentHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/**
 * 虚拟滚动视口采样门闩：丢弃切回瞬间的 0 高度 / 假滚动，避免 padding 跳变。
 * 连接树、本地文件树、以及其它同类虚拟窗共用。
 */
export function shouldApplyViewportSample(
    next: ViewportSample,
    previous: ViewportSample,
    options?: {documentHidden?: boolean},
): boolean {
    if (options?.documentHidden ?? isDocumentHidden()) return false
    if (next.viewportHeight <= 0 && previous.viewportHeight > 0) return false
    if (next.viewportHeight <= 0 && previous.scrollTop > 0 && next.scrollTop === 0) {
        return false
    }
    return true
}

export type ForegroundSettleOptions = {
    /** 布局双 rAF 之后再等多久再跑回调（默认 0；重 DOM 刷新可略延后） */
    afterMs?: number
    /** 若在等待期间再次 hidden，取消回调 */
    cancelIfHidden?: boolean
}

/**
 * 窗口重新可见且布局稳定后再执行。用于 git 状态、磁盘轮询等「聚焦刷新」，
 * 避免与首帧合成重绘叠在一起。
 */
export function scheduleAfterForegroundSettle(
    run: () => void,
    options?: ForegroundSettleOptions,
): () => void {
    const afterMs = Math.max(0, options?.afterMs ?? 0)
    const cancelIfHidden = options?.cancelIfHidden !== false
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let raf1 = 0
    let raf2 = 0

    const clear = () => {
        cancelled = true
        if (timer) clearTimeout(timer)
        timer = null
        if (raf1) cancelAnimationFrame(raf1)
        if (raf2) cancelAnimationFrame(raf2)
        raf1 = 0
        raf2 = 0
    }

    const finish = () => {
        if (cancelled) return
        if (cancelIfHidden && isDocumentHidden()) return
        run()
    }

    raf1 = requestAnimationFrame(() => {
        raf1 = 0
        raf2 = requestAnimationFrame(() => {
            raf2 = 0
            if (cancelled) return
            if (cancelIfHidden && isDocumentHidden()) return
            if (afterMs <= 0) {
                finish()
                return
            }
            timer = setTimeout(finish, afterMs)
        })
    })

    return clear
}

/** focus + visibilitychange 统一挂「前台恢复后再跑」；返回卸载函数。 */
export function bindForegroundSettleRefresh(
    run: () => void,
    options?: ForegroundSettleOptions,
): () => void {
    let cancelPending: (() => void) | null = null

    const kick = () => {
        if (isDocumentHidden()) return
        cancelPending?.()
        cancelPending = scheduleAfterForegroundSettle(run, options)
    }

    const onVisibility = () => {
        if (document.visibilityState === 'visible') kick()
    }

    window.addEventListener('focus', kick)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
        cancelPending?.()
        window.removeEventListener('focus', kick)
        document.removeEventListener('visibilitychange', onVisibility)
    }
}
