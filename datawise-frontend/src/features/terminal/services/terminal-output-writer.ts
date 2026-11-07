import type {TerminalOutputChunk} from '@/features/terminal/services/native-terminal.types'

export type TerminalOutputWriteFn = (
    data: TerminalOutputChunk,
    done?: () => void,
) => void

export type TerminalOutputWriterOptions = {
    /** Soft coalesce window via rAF; fallback timeout when rAF missing (tests/Node). */
    flushDelayMs?: number
    /** Flush immediately once pending reaches this many bytes. */
    flushBytes?: number
    /** Drop oldest pending data when over this cap (JCEF flood guard). */
    maxPendingBytes?: number
}

export type TerminalOutputWriter = {
    push: (chunk: TerminalOutputChunk) => void
    flush: () => void
    dispose: () => void
    /** Bytes discarded under backpressure since create/reset. */
    droppedBytes: () => number
}

/** Defaults tuned for JCEF: fewer, larger paints; tighter pending cap. */
export const JCEF_TERMINAL_OUTPUT_DEFAULTS = {
    flushBytes: 96 * 1024,
    maxPendingBytes: 512 * 1024,
    flushDelayMs: 16,
} as const

const DEFAULT_FLUSH_BYTES = JCEF_TERMINAL_OUTPUT_DEFAULTS.flushBytes
const DEFAULT_MAX_PENDING = JCEF_TERMINAL_OUTPUT_DEFAULTS.maxPendingBytes
const DEFAULT_FLUSH_DELAY_MS = JCEF_TERMINAL_OUTPUT_DEFAULTS.flushDelayMs

function chunkByteLength(chunk: TerminalOutputChunk): number {
    return typeof chunk === 'string' ? chunk.length : chunk.byteLength
}

function mergeQueue(queue: TerminalOutputChunk[]): TerminalOutputChunk[] {
    if (queue.length <= 1) return queue
    const out: TerminalOutputChunk[] = []
    let i = 0
    while (i < queue.length) {
        const head = queue[i]!
        if (typeof head === 'string') {
            let text = head
            i += 1
            while (i < queue.length && typeof queue[i] === 'string') {
                text += queue[i] as string
                i += 1
            }
            out.push(text)
            continue
        }
        const parts: Uint8Array[] = [head]
        let total = head.byteLength
        i += 1
        while (i < queue.length && typeof queue[i] !== 'string') {
            const part = queue[i] as Uint8Array
            parts.push(part)
            total += part.byteLength
            i += 1
        }
        if (parts.length === 1) {
            out.push(parts[0]!)
        } else {
            const merged = new Uint8Array(total)
            let offset = 0
            for (const part of parts) {
                merged.set(part, offset)
                offset += part.byteLength
            }
            out.push(merged)
        }
    }
    return out
}

/**
 * Coalesce high-rate PTY output before touching xterm.js.
 * Uses write-completion backpressure so JCEF is not buried under stacked paints.
 */
export function createTerminalOutputWriter(
    write: TerminalOutputWriteFn,
    options?: TerminalOutputWriterOptions,
): TerminalOutputWriter {
    const flushBytes = Math.max(1, options?.flushBytes ?? DEFAULT_FLUSH_BYTES)
    const maxPendingBytes = Math.max(
        1,
        options?.maxPendingBytes ?? Math.max(DEFAULT_MAX_PENDING, flushBytes),
    )
    const flushDelayMs = Math.max(0, options?.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS)

    let pending: TerminalOutputChunk[] = []
    let pendingBytes = 0
    let dropped = 0
    let disposed = false
    let writing = false
    let rafId: number | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function cancelScheduled() {
        if (rafId != null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId)
        }
        rafId = null
        if (timeoutId != null) {
            clearTimeout(timeoutId)
            timeoutId = null
        }
    }

    function dropOldestUntilFit(incoming: number) {
        while (pending.length > 0 && pendingBytes + incoming > maxPendingBytes) {
            const removed = pending.shift()!
            const removedBytes = chunkByteLength(removed)
            pendingBytes = Math.max(0, pendingBytes - removedBytes)
            dropped += removedBytes
        }
        if (pendingBytes + incoming > maxPendingBytes) {
            dropped += incoming
            return false
        }
        return true
    }

    function writeNext(chunks: TerminalOutputChunk[], index: number, onIdle: () => void) {
        if (disposed) {
            onIdle()
            return
        }
        if (index >= chunks.length) {
            onIdle()
            return
        }
        const chunk = chunks[index]!
        let settled = false
        const finish = () => {
            if (settled) return
            settled = true
            writeNext(chunks, index + 1, onIdle)
        }
        try {
            write(chunk, finish)
        } catch {
            finish()
        }
    }

    function flushMerged(forceSync = false) {
        if (disposed) {
            pending = []
            pendingBytes = 0
            return
        }
        if (writing) {
            if (forceSync) {
                // Caller wants drain now (exit/teardown) — keep pending for after current write.
                return
            }
            scheduleFlush()
            return
        }
        if (pending.length === 0) return

        const queue = mergeQueue(pending)
        pending = []
        pendingBytes = 0
        writing = true
        writeNext(queue, 0, () => {
            writing = false
            if (disposed) return
            if (pending.length > 0) {
                if (pendingBytes >= flushBytes) {
                    flushMerged()
                } else {
                    scheduleFlush()
                }
            }
        })
    }

    function scheduleFlush() {
        if (disposed || writing || rafId != null || timeoutId != null) return
        // rAF + timeout (first wins): JCEF often starves rAF until input/focus,
        // which made streaming output feel stuck until the user hit Enter.
        if (typeof requestAnimationFrame === 'function') {
            rafId = requestAnimationFrame(() => {
                rafId = null
                if (timeoutId != null) {
                    clearTimeout(timeoutId)
                    timeoutId = null
                }
                flushMerged()
            })
        }
        timeoutId = setTimeout(() => {
            timeoutId = null
            if (rafId != null && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            flushMerged()
        }, flushDelayMs)
    }

    return {
        push(chunk) {
            if (disposed || chunk == null) return
            if (typeof chunk === 'string') {
                if (chunk.length === 0) return
            } else if (chunk.byteLength === 0) {
                return
            }
            const size = chunkByteLength(chunk)
            if (!dropOldestUntilFit(size)) {
                return
            }
            pending.push(chunk)
            pendingBytes += size
            if (!writing && pendingBytes >= flushBytes) {
                cancelScheduled()
                flushMerged()
                return
            }
            scheduleFlush()
        },
        flush() {
            cancelScheduled()
            // Spin until the current paint finishes, then drain pending once.
            if (writing) {
                const wait = () => {
                    if (disposed) return
                    if (writing) {
                        if (typeof requestAnimationFrame === 'function') {
                            requestAnimationFrame(wait)
                        } else {
                            setTimeout(wait, flushDelayMs)
                        }
                        return
                    }
                    flushMerged()
                }
                wait()
                return
            }
            flushMerged()
        },
        dispose() {
            disposed = true
            cancelScheduled()
            pending = []
            pendingBytes = 0
            writing = false
        },
        droppedBytes: () => dropped,
    }
}
