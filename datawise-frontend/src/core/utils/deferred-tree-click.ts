/** 区分树节点单击与双击：延迟触发单击，双击时取消待执行的单击 */
export function createDeferredTreeClickHandlers<T>(options: {
    onSingle: (value: T) => void
    onDouble: (value: T) => void
    delayMs?: number
}) {
    const delayMs = options.delayMs ?? 280
    let timer: ReturnType<typeof setTimeout> | null = null
    let pending: T | null = null

    function cancelPending() {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
        pending = null
    }

    function scheduleSingle(value: T) {
        cancelPending()
        pending = value
        timer = setTimeout(() => {
            timer = null
            const target = pending
            pending = null
            if (target != null) options.onSingle(target)
        }, delayMs)
    }

    function triggerDouble(value: T) {
        cancelPending()
        options.onDouble(value)
    }

    function dispose() {
        cancelPending()
    }

    return {scheduleSingle, triggerDouble, cancelPending, dispose}
}
