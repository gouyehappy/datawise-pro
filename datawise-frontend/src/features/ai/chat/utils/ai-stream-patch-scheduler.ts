/**
 * Coalesce high-frequency AI stream patches onto rAF / soft timeout (PERF-02).
 * Mirrors terminal-output-writer: rAF + timeout (first wins) so JCEF starvation
 * cannot stall the live bubble forever.
 */

export type AiStreamPatchSnapshot = {
    content: string
    thinking?: string
}

export type AiStreamPatchScheduler = {
    /** Latest buffers; schedules a coalesced flush. */
    push: (snapshot: AiStreamPatchSnapshot) => void
    /** Cancel pending schedule and flush immediately (finalize / abort). */
    flush: () => void
    /** Drop pending work without flushing. */
    cancel: () => void
    dispose: () => void
}

export function createAiStreamPatchScheduler(options: {
    apply: (snapshot: AiStreamPatchSnapshot) => void
    /** Soft coalesce window when rAF is starved (JCEF). Default 40ms. */
    delayMs?: number
}): AiStreamPatchScheduler {
    const delayMs = Math.max(16, options.delayMs ?? 40)
    let pending: AiStreamPatchSnapshot | null = null
    let rafId: number | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    function cancelScheduled() {
        if (rafId != null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId)
            rafId = null
        }
        if (timeoutId != null) {
            clearTimeout(timeoutId)
            timeoutId = null
        }
    }

    function flushPending() {
        if (disposed) {
            pending = null
            return
        }
        const snapshot = pending
        pending = null
        if (!snapshot) return
        options.apply(snapshot)
    }

    function schedule() {
        if (disposed || rafId != null || timeoutId != null) return
        if (typeof requestAnimationFrame === 'function') {
            rafId = requestAnimationFrame(() => {
                rafId = null
                if (timeoutId != null) {
                    clearTimeout(timeoutId)
                    timeoutId = null
                }
                flushPending()
            })
        }
        timeoutId = setTimeout(() => {
            timeoutId = null
            if (rafId != null && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            flushPending()
        }, delayMs)
    }

    return {
        push(snapshot) {
            if (disposed) return
            pending = {
                content: snapshot.content,
                thinking: snapshot.thinking,
            }
            schedule()
        },
        flush() {
            cancelScheduled()
            flushPending()
        },
        cancel() {
            cancelScheduled()
            pending = null
        },
        dispose() {
            disposed = true
            cancelScheduled()
            pending = null
        },
    }
}
