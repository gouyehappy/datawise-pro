import type {StatusSnapshot} from '@/core/types'

export function buildExecutionStatus(
    rows: number,
    durationMs: number,
    formatRowCount: (rows: number) => string,
): StatusSnapshot {
    return {
        message: '',
        duration: `${durationMs}ms`,
        durationMs,
        rowCount: formatRowCount(rows),
    }
}
