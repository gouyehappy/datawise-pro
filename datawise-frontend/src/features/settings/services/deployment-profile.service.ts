import type {DeploymentCheck, DeploymentProfileSnapshot} from '@/shared/api/types'

export function deploymentModeLabelKey(mode: string): string {
    switch (mode) {
        case 'dev':
            return 'settings.systemMetrics.deployment.modeDev'
        case 'desktop':
            return 'settings.systemMetrics.deployment.modeDesktop'
        case 'server':
            return 'settings.systemMetrics.deployment.modeServer'
        default:
            return 'settings.systemMetrics.deployment.modeDefault'
    }
}

export function deploymentCheckLabelKey(id: string): string {
    return `settings.systemMetrics.deployment.checkLabels.${id.replace(/\./g, '_')}`
}

export function deploymentStatusTone(status: string): 'ok' | 'warn' | 'info' {
    if (status === 'ok') return 'ok'
    if (status === 'warn') return 'warn'
    return 'info'
}

export function summarizeDeploymentProfile(profile: DeploymentProfileSnapshot | null): {
    warnCount: number
    pythonSimulated: boolean
} {
    return {
        warnCount: profile?.warnCount ?? 0,
        pythonSimulated: Boolean(profile?.pythonSimulated),
    }
}

export function sortDeploymentChecks(checks: readonly DeploymentCheck[]): DeploymentCheck[] {
    const rank: Record<string, number> = {warn: 0, info: 1, ok: 2}
    return [...checks].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
}
