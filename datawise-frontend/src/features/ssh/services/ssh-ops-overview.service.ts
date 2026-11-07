import type {RelatedConnectionItem} from '@/features/ssh/services/ssh-related-connections.service'

export interface SshOpsOverview {
    host: string
    yarn: number
    kafka: number
    sql: number
    redis: number
}

export function buildSshOpsOverview(
    sshHost: string,
    related: RelatedConnectionItem[],
): SshOpsOverview {
    const overview: SshOpsOverview = {
        host: sshHost.trim(),
        yarn: 0,
        kafka: 0,
        sql: 0,
        redis: 0,
    }

    for (const item of related) {
        if (item.kind.startsWith('yarn')) {
            overview.yarn += 1
            continue
        }
        if (item.kind.startsWith('kafka')) {
            overview.kafka += 1
            continue
        }
        if (item.kind === 'sql-console') {
            overview.sql += 1
            continue
        }
        if (item.kind === 'redis-console') {
            overview.redis += 1
        }
    }

    return overview
}

export function opsOverviewHasCounts(overview: SshOpsOverview): boolean {
    return overview.yarn + overview.kafka + overview.sql + overview.redis > 0
}
