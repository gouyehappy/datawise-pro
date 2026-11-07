/** Dev-only structured timing logs (browser console). */

type PerfLogGate = (connectionId?: string) => boolean

let perfLogGate: PerfLogGate = () => Boolean(import.meta.env.DEV)

/** Settings / diagnostics bind the production gate after Pinia boots (avoids core → features). */
export function bindPerfLogGate(gate: PerfLogGate | null): void {
    perfLogGate = gate ?? (() => Boolean(import.meta.env.DEV))
}

export function shouldEmitPerfLog(connectionId?: string): boolean {
    return perfLogGate(connectionId)
}

export function perfNow(): number {
    return performance.now()
}

export function logPerf(operation: string, startedAt: number, details?: Record<string, unknown>): void {
    const connectionId = typeof details?.connectionId === 'string' ? details.connectionId : undefined
    if (!shouldEmitPerfLog(connectionId)) {
        return
    }
    const durationMs = Math.round(performance.now() - startedAt)
    if (details && Object.keys(details).length > 0) {
        console.info(`[PERF] ${operation} ${durationMs}ms`, details)
        return
    }
    console.info(`[PERF] ${operation} ${durationMs}ms`)
}
