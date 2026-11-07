import type {DbType} from '@/core/types'
import {registerStatelessConnectorUse} from '@/features/explorer/services/register-connection-health.service'

/** Touch health registry when opening a stateless connector workspace tab. */
export function touchStatelessWorkspaceTab(connectionId: string, dbType: DbType) {
    registerStatelessConnectorUse(connectionId, dbType, 'ok')
}
