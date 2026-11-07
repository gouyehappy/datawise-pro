export type {
    RedisCommandResult,
    RedisConsoleEntry,
} from '@/shared/api/redis.types'

import type {RedisConsoleEntry} from '@/shared/api/redis.types'

export function formatRedisConsoleEntry(entry: RedisConsoleEntry): string {
    const header = `> ${entry.command}`
    if (!entry.success) {
        return `${header}\n(error) ${entry.output}`
    }
    const body = entry.output || '(empty)'
    return `${header}\n${body}`
}
