import type {SqlLogEntry} from '@/core/types'

/**
 * PERF-12: shallow key so sticky consoles do not deep-watch sqlLogs payloads.
 * Id list + length covers append/remove/reorder without scanning SQL text.
 */
export function sqlLogsRecentSyncKey(
    logs: readonly Pick<SqlLogEntry, 'id'>[],
    connectionId: string | null | undefined,
    database: string | null | undefined,
): string {
    return [
        connectionId ?? '',
        database ?? '',
        String(logs.length),
        logs.map((log) => log.id).join('\0'),
    ].join('|')
}
