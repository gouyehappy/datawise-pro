import type {ConnectionConfig} from '@/core/types'
import {createDefaultConnection} from '@/features/connection/utils/connection-defaults'
import {buildJdbcUrl} from '@/features/connection/utils/jdbc-url'
import {DEFAULT_PORTS} from '@/features/connection/constants/db-types'
import type {ThirdPartyConnectionDraft} from './types'

export function draftToConnectionConfig(draft: ThirdPartyConnectionDraft): ConnectionConfig {
    const base = createDefaultConnection(draft.dbType)
    const port = draft.port || DEFAULT_PORTS[draft.dbType] || base.port
    const host = draft.host || 'localhost'
    const database = draft.database || ''
    const url =
        draft.url?.trim()
        || buildJdbcUrl(draft.dbType, host, port, {
            database,
            sid: draft.dbType === 'oracle' ? (database || 'XE') : undefined,
        })
    return {
        ...base,
        id: `new-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: draft.name,
        host,
        port,
        user: draft.user || base.user,
        password: '',
        database,
        url,
        sid: draft.dbType === 'oracle' ? (database || base.sid) : base.sid,
    }
}

export function draftsToConnectionConfigs(drafts: ThirdPartyConnectionDraft[]): ConnectionConfig[] {
    return drafts.map(draftToConnectionConfig)
}
