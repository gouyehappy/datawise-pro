export type {
    JenkinsInfo,
    JenkinsViewSummary,
    JenkinsViewsResult,
    JenkinsJobSummary,
    JenkinsJobsResult,
    JenkinsBuildSummary,
    JenkinsJobParameter,
    JenkinsJobDetail,
    JenkinsMutationResult,
    JenkinsBuildLog,
    JenkinsQueueItem,
    JenkinsQueueResult,
    JenkinsNodeSummary,
    JenkinsNodesResult,
} from '@/shared/api/jenkins.types'

import type {JenkinsBuildSummary} from '@/shared/api/jenkins.types'

export function jenkinsJobStatusLabel(color: string | null | undefined): string {
    const value = (color ?? '').toLowerCase()
    if (!value) return '—'
    if (value.endsWith('_anime')) return 'building'
    if (value === 'blue' || value === 'blue_anime') return 'success'
    if (value === 'red' || value === 'red_anime') return 'failure'
    if (value === 'yellow' || value === 'yellow_anime') return 'unstable'
    if (value === 'aborted' || value === 'aborted_anime') return 'aborted'
    if (value === 'disabled') return 'disabled'
    if (value === 'notbuilt' || value === 'notbuilt_anime') return 'not built'
    return value
}

/** Map Jenkins color/result text to an i18n key under explorer.jenkinsJobs.*, or null if unknown. */
export function jenkinsStatusI18nKey(raw: string | null | undefined): string | null {
    const value = (raw ?? '').trim().toLowerCase().replace(/\s+/g, '')
    if (!value || value === '—') return null
    if (value === 'building' || value.endsWith('_anime')) return 'explorer.jenkinsJobs.statusBuilding'
    if (value === 'success' || value === 'blue') return 'explorer.jenkinsJobs.statusSuccess'
    if (value === 'failure' || value === 'red' || value === 'failed') return 'explorer.jenkinsJobs.statusFailure'
    if (value === 'unstable' || value === 'yellow') return 'explorer.jenkinsJobs.statusUnstable'
    if (value === 'aborted') return 'explorer.jenkinsJobs.statusAborted'
    if (value === 'disabled') return 'explorer.jenkinsJobs.statusDisabled'
    if (value === 'notbuilt' || value === 'not_built') return 'explorer.jenkinsJobs.statusNotBuilt'
    return null
}

export function isJenkinsBuildStoppable(build: Pick<JenkinsBuildSummary, 'building'> | null | undefined): boolean {
    return Boolean(build?.building)
}

export function formatJenkinsTimestamp(ms: number): string {
    if (!ms || ms <= 0) return '—'
    return new Date(ms).toLocaleString()
}

export function formatJenkinsRelativeTime(ms: number | null | undefined): string {
    if (!ms || ms <= 0) return '—'
    const diff = Math.max(0, Date.now() - ms)
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return '<1m'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 48) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 60) return `${days}d`
    const months = Math.floor(days / 30)
    if (months < 24) return `${months}mo`
    return `${Math.floor(months / 12)}y`
}

export function formatJenkinsDuration(ms: number): string {
    if (!ms || ms <= 0) return '—'
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
}

export function jenkinsParameterInputKind(type: string | null | undefined): 'boolean' | 'choice' | 'password' | 'text' | 'string' {
    const value = (type ?? '').toLowerCase()
    if (value.includes('boolean')) return 'boolean'
    if (value.includes('choice')) return 'choice'
    if (value.includes('password')) return 'password'
    if (value.includes('text')) return 'text'
    return 'string'
}
