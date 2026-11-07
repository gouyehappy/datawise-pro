import type {ConnectionConfig, DbType} from '@/core/types'
import {readKafkaBootstrap} from '@/features/connection/utils/kafka-security'
import {readKuduMasters} from '@/features/connection/utils/kudu-masters'
import {formatConnectionEndpointLabel} from '@/features/explorer/services/explorer-status-path.service'

/**
 * 欢迎页连接卡片副标题：优先可读地址，避免 pluginId / 类型重复堆叠。
 */
export function formatWelcomeConnectionSubtitle(
    config: ConnectionConfig | null | undefined,
    fallbackDbType?: DbType,
): string {
    if (!config) return ''

    const dbType = config.dbType || fallbackDbType

    if (dbType === 'kafka') {
        const bootstrap = readKafkaBootstrap(config)?.trim()
        if (bootstrap) return bootstrap
    }

    if (dbType === 'kudu') {
        const masters = readKuduMasters(config)?.trim()
        if (masters) return masters
    }

    if (dbType === 'ssh') {
        const host = config.host?.trim()
        if (host) {
            const user = config.user?.trim()
            const port = config.port?.trim()
            const target = user ? `${user}@${host}` : host
            return port ? `${target}:${port}` : target
        }
    }

    const url = config.url?.trim()
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        return url
    }

    const endpoint = formatConnectionEndpointLabel(config).replace(/^@/, '').trim()
    if (endpoint && endpoint !== config.name?.trim()) return endpoint

    const database = config.database?.trim()
    if (database) return database

    return ''
}
