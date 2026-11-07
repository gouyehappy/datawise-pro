import {platformApi} from '@/api'
import type {PlatformFeatureId} from '@/features/platform/types/platform.types'
import type {FederatedViewSource} from '@/features/platform/types/platform.types'
import type {PlatformCatalogRow} from '@/features/platform/services/platform-catalog.service'

export function platformCatalogRowLabel(feature: PlatformFeatureId, row: PlatformCatalogRow): string {
    switch (feature) {
        case 'analysis_canvas':
            return String(row.title ?? row.id)
        default:
            return String(row.name ?? row.id)
    }
}

export async function autoGeneratePlatformSemanticMetrics(
    connectionId: string,
    database: string,
): Promise<number> {
    const created = await platformApi.autoGenerateSemanticMetrics({connectionId, database})
    return created.length
}

export async function deletePlatformCatalogItems(feature: PlatformFeatureId, ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids.filter(Boolean))]
    if (!uniqueIds.length) return
    await Promise.all(uniqueIds.map((id) => deletePlatformCatalogItem(feature, id)))
}

async function deletePlatformCatalogItem(feature: PlatformFeatureId, id: string): Promise<void> {
    switch (feature) {
        case 'semantic_metrics':
            await platformApi.deleteSemanticMetric(id)
            break
        case 'analysis_canvas':
            await platformApi.deleteAnalysisCanvas(id)
            break
        case 'federated_views':
            await platformApi.deleteFederatedView(id)
            break
        case 'schema_drift':
            await platformApi.deleteSchemaDriftMonitor(id)
            break
        case 'scheduled_tasks':
        case 'data_quality':
            await platformApi.deleteScheduledTask(id)
            break
    }
}

export type PlatformCatalogFormPayload =
    | {
    feature: 'semantic_metrics'
    id?: string
    name: string
    expression: string
    description: string
    unit: string
    owner: string
    tags: string
    upstreamMetrics: string
    changeNote: string
}
    | {feature: 'analysis_canvas'; title: string; description: string; promptTemplate: string; sql: string}
    | {feature: 'federated_views'; name: string; description: string; sql: string; sourcesJson: string}
    | {
    feature: 'schema_drift'
    name: string
    targetConnectionId: string
    targetDatabase: string
    tablePattern: string
    enabled: boolean
}
    | {
    feature: 'scheduled_tasks'
    name: string
    type: string
    cronExpression: string
    payloadJson: string
    enabled: boolean
}
    | {
    feature: 'data_quality'
    name: string
    type: string
    cronExpression: string
    payloadJson: string
    enabled: boolean
}

export async function savePlatformCatalogItem(
    payload: PlatformCatalogFormPayload,
    context: {connectionId?: string; database?: string},
): Promise<{definitionChanged?: boolean; metricName?: string}> {
    switch (payload.feature) {
        case 'semantic_metrics': {
            const connectionId = context.connectionId?.trim()
            const database = context.database?.trim()
            if (!connectionId || !database || !payload.name.trim()) return {}
            const scopedMetrics = await platformApi.listSemanticMetrics(connectionId, database)
            const existing = payload.id?.trim()
                ? payload.id.trim()
                : scopedMetrics
                    .find((item) => item.name.trim().toLowerCase() === payload.name.trim().toLowerCase())
                    ?.id
            const previous = existing
                ? scopedMetrics.find((item) => item.id === existing)?.expression?.trim()
                : undefined
            const nextExpression = payload.expression.trim()
            await platformApi.saveSemanticMetric({
                id: existing,
                connectionId,
                database,
                name: payload.name.trim(),
                expression: nextExpression,
                description: payload.description.trim() || undefined,
                unit: payload.unit.trim() || undefined,
                owner: payload.owner.trim() || undefined,
                tags: payload.tags
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                upstreamMetrics: payload.upstreamMetrics
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                changeNote: payload.changeNote.trim() || undefined,
            })
            return {
                definitionChanged: Boolean(existing && previous !== undefined && previous !== nextExpression),
                metricName: payload.name.trim(),
            }
        }
        case 'analysis_canvas':
            if (!payload.title.trim()) return {}
            await platformApi.saveAnalysisCanvas({
                title: payload.title.trim(),
                description: payload.description.trim() || undefined,
                promptTemplate: payload.promptTemplate.trim() || undefined,
                sql: payload.sql.trim() || undefined,
            })
            return {}
        case 'federated_views': {
            if (!payload.name.trim()) return {}
            let sources: FederatedViewSource[] = []
            if (payload.sourcesJson.trim()) {
                sources = JSON.parse(payload.sourcesJson) as FederatedViewSource[]
            }
            await platformApi.saveFederatedView({
                name: payload.name.trim(),
                description: payload.description.trim() || undefined,
                sql: payload.sql.trim() || undefined,
                sources,
            })
            return {}
        }
        case 'schema_drift': {
            const sourceConnectionId = context.connectionId?.trim()
            const sourceDatabase = context.database?.trim()
            if (!sourceConnectionId || !sourceDatabase || !payload.name.trim()) return {}
            await platformApi.saveSchemaDriftMonitor({
                name: payload.name.trim(),
                sourceConnectionId,
                sourceDatabase,
                targetConnectionId: payload.targetConnectionId.trim(),
                targetDatabase: payload.targetDatabase.trim(),
                tablePattern: payload.tablePattern.trim() || '%',
                enabled: payload.enabled,
            })
            return {}
        }
        case 'scheduled_tasks':
        case 'data_quality':
            if (!payload.name.trim() || !payload.type.trim()) return {}
            await platformApi.saveScheduledTask({
                name: payload.name.trim(),
                type: payload.type.trim(),
                cronExpression: payload.cronExpression.trim() || undefined,
                payloadJson: payload.payloadJson.trim() || undefined,
                enabled: payload.enabled,
            })
            return {}
    }
    return {}
}
