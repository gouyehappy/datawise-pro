import {explorerApi} from '@/api'
import type {ConnectionConfig} from '@/core/types'
import {CONFIG_FILES} from '@/shared/config/config-paths'

/** 读取连接配置（Explorer API 为权威来源）。 */
export async function fetchConnectionConfig(connectionId: string): Promise<ConnectionConfig | null> {
    try {
        return await explorerApi.fetchConnection(connectionId)
    } catch {
        return null
    }
}

/** @deprecated 使用 fetchConnectionConfig */
export const fetchConnectionFromCatalog = fetchConnectionConfig

/** 配置落盘路径（供 UI 提示） */
export const CONNECTIONS_CONFIG_FILE = CONFIG_FILES.connections
