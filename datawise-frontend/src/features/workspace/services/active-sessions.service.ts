import type {ActiveSession} from '@/shared/api/types'

export type {
    ActiveSession,
    ActiveSessionList,
    ActiveSessionQuery,
} from '@/shared/api/types'

export function formatSessionDuration(seconds: number): string {
    if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        return `${hours}h ${mins}m`
    }
    if (seconds >= 60) {
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    }
    return `${seconds}s`
}

export function truncateSessionSql(sql: string, max = 160): string {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (!normalized) return ''
    if (normalized.length <= max) return normalized
    return `${normalized.slice(0, max)}…`
}

export function isActiveSession(session: ActiveSession): boolean {
    const command = session.command.toLowerCase()
    const state = session.state.toLowerCase()
    if (command === 'sleep' || command === 'daemon') return false
    if (state === 'idle') return false
    return session.durationSeconds > 0 || command.includes('query') || state.includes('active')
}
