export type {
    YarnMutationResult,
    YarnClusterInfo,
    YarnAppSummary,
    YarnAppDetail,
    YarnAppsResult,
    YarnNodeSummary,
    YarnNodesResult,
    YarnQueueSummary,
    YarnQueuesResult,
} from '@/shared/api/yarn.types'

export function isYarnAppKillable(state: string | null | undefined): boolean {
    const normalized = (state ?? '').toUpperCase()
    return normalized === 'RUNNING'
        || normalized === 'ACCEPTED'
        || normalized === 'SUBMITTED'
        || normalized === 'NEW'
        || normalized === 'NEW_SAVING'
}

export const YARN_APP_STATE_OPTIONS = [
    'RUNNING',
    'ACCEPTED',
    'FINISHED',
    'FAILED',
    'KILLED',
] as const

/** YARN REST `states` query — comma-separated uppercase values; empty = no filter. */
export function formatYarnStateFilter(states: readonly string[]): string | undefined {
    const normalized = states
        .map((state) => state.trim().toUpperCase())
        .filter(Boolean)
    return normalized.length ? normalized.join(',') : undefined
}

export function formatYarnTimestamp(ms: number): string {
    if (!ms || ms <= 0) return '—'
    return new Date(ms).toLocaleString()
}

export function formatYarnDuration(ms: number): string {
    if (!ms || ms <= 0) return '—'
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
}

export function formatYarnMemory(mb: number): string {
    if (!mb || mb <= 0) return '—'
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb} MB`
}
