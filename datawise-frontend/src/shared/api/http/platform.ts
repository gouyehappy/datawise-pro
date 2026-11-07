import type {PlatformApi} from '@/shared/api/types'
import type {
    AnalysisCanvasDetail,
    AnalysisCanvasSummary,
    AnalyzeFederatedJoinRiskRequest,
    AutoGenerateSemanticMetricsRequest,
    DiscoverySearchPage,
    ExecuteFederatedViewRequest,
    FederatedJoinRiskHints,
    FederatedViewDetail,
    GenerateFederatedSqlRequest,
    GenerateFederatedSqlResult,
    FederatedViewSummary,
    QueryLibraryVersion,
    RerunAnalysisCanvasRequest,
    RerunAnalysisCanvasResult,
    SaveAnalysisCanvasRequest,
    SaveFederatedViewRequest,
    SaveQueryLibraryVersionRequest,
    DataQualityGateRequest,
    DataQualityGateResult,
    DataQualitySharedTemplate,
    SaveDataQualitySharedTemplateRequest,
    OrchestrationStatusResult,
    SaveScheduledTaskRequest,
    SaveSchemaDriftMonitorRequest,
    SaveSemanticMetricRequest,
    ScheduledTask,
    SchemaDriftCompareRequest,
    SchemaDriftMonitor,
    SchemaDriftReport,
    SemanticMetric,
    SqlReviewRequest,
    SqlReviewResult,
} from '@/shared/api/platform.types'
import type {FederatedViewExecuteResult} from '@/shared/api/types'
import type {
    CreateInsightActionRequest,
    OutboundEventDefinition,
    InsightActionResult,
    OutboundWebhook,
    OutboundWebhookSubscription,
    SaveOutboundWebhookResult,
    OutboundWebhookTestResult,
    SaveOutboundWebhookRequest,
} from '@/shared/api/types'
import type {
    OutboundWebhookDto,
    OutboundWebhookSubscriptionDto,
    OutboundWebhookTestResultDto,
    SaveOutboundWebhookRequest as WireSaveOutboundWebhookRequest,
    SaveOutboundWebhookResultDto,
    SaveScheduledTaskRequestDto,
    ScheduledTaskDto,
    OrchestrationStatusDto,
} from '@/shared/api/generated'
import {deleteJson, getJson, postJson, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function encodeId(id: string): string {
    return encodeURIComponent(id)
}

function mapSubscription(wire: OutboundWebhookSubscriptionDto): OutboundWebhookSubscription {
    return {
        eventType: String(wire.eventType ?? ''),
        enabled: Boolean(wire.enabled),
        titleTemplate: wire.titleTemplate ?? null,
        bodyTemplate: wire.bodyTemplate ?? null,
        mentionAll: wire.mentionAll ?? null,
        mentionMobiles: wire.mentionMobiles,
        mentionUserIds: wire.mentionUserIds,
    }
}

function mapWebhook(wire: OutboundWebhookDto): OutboundWebhook {
    return {
        id: String(wire.id ?? ''),
        name: String(wire.name ?? ''),
        enabled: Boolean(wire.enabled),
        channel: wire.channel,
        url: String(wire.url ?? ''),
        hasSecret: Boolean(wire.hasSecret),
        eventTypes: [...(wire.eventTypes ?? [])],
        subscriptions: wire.subscriptions?.map(mapSubscription),
        timeoutMs: Number(wire.timeoutMs ?? 0),
        includeSql: Boolean(wire.includeSql),
        createdAt: wire.createdAt ?? null,
        updatedAt: wire.updatedAt ?? null,
        lastSuccessAt: wire.lastSuccessAt ?? null,
        lastFailureAt: wire.lastFailureAt ?? null,
        lastError: wire.lastError ?? null,
        messageTemplate: wire.messageTemplate ?? null,
        mentionAll: wire.mentionAll,
        mentionMobiles: wire.mentionMobiles,
        mentionUserIds: wire.mentionUserIds,
    }
}

function mapWebhookTest(wire: OutboundWebhookTestResultDto): OutboundWebhookTestResult {
    return {
        ok: Boolean(wire.ok),
        statusCode: Number(wire.statusCode ?? 0),
        message: String(wire.message ?? ''),
        responseBody: wire.responseBody ?? null,
    }
}

function mapSaveWebhookResult(wire: SaveOutboundWebhookResultDto): SaveOutboundWebhookResult {
    return {
        webhook: mapWebhook(wire.webhook ?? {}),
        confirmationAttempted: Boolean(wire.confirmationAttempted),
        confirmationSkipped: Boolean(wire.confirmationSkipped),
        confirmationResult: wire.confirmationResult
            ? mapWebhookTest(wire.confirmationResult)
            : null,
    }
}

function mapScheduledTask(wire: ScheduledTaskDto): ScheduledTask {
    return {
        id: String(wire.id ?? ''),
        name: String(wire.name ?? ''),
        type: String(wire.type ?? ''),
        cronExpression: wire.cronExpression ?? null,
        payloadJson: wire.payloadJson ?? null,
        enabled: Boolean(wire.enabled),
        lastRunAt: wire.lastRunAt ?? null,
        lastRunStatus: wire.lastRunStatus ?? null,
        lastRunMessage: wire.lastRunMessage ?? null,
        createdAt: wire.createdAt ?? null,
        orchestrationState: wire.orchestrationState ?? null,
        orchestrationRef: wire.orchestrationRef ?? null,
        orchestrationCheckedAt: wire.orchestrationCheckedAt ?? null,
        orchestrationDetail: wire.orchestrationDetail ?? null,
    }
}

function toWireSaveScheduledTask(request: SaveScheduledTaskRequest): SaveScheduledTaskRequestDto {
    return {
        id: request.id ?? undefined,
        name: request.name,
        type: request.type,
        cronExpression: request.cronExpression ?? undefined,
        payloadJson: request.payloadJson ?? undefined,
        enabled: request.enabled ?? undefined,
    }
}

function mapOrchestrationStatus(wire: OrchestrationStatusDto): OrchestrationStatusResult {
    return {
        taskId: String(wire.taskId ?? ''),
        taskName: String(wire.taskName ?? ''),
        state: String(wire.state ?? ''),
        ref: wire.ref ?? null,
        detail: wire.detail ?? null,
        statusUrl: wire.statusUrl ?? null,
        httpStatus: Number(wire.httpStatus ?? 0),
        checkedAt: wire.checkedAt ?? null,
    }
}

function toWireSaveWebhook(request: SaveOutboundWebhookRequest): WireSaveOutboundWebhookRequest {
    return {
        id: request.id,
        name: request.name,
        enabled: request.enabled,
        channel: request.channel,
        url: request.url,
        secret: request.secret,
        eventTypes: request.eventTypes,
        subscriptions: request.subscriptions?.map((sub) => ({
            eventType: sub.eventType,
            enabled: sub.enabled,
            titleTemplate: sub.titleTemplate ?? undefined,
            bodyTemplate: sub.bodyTemplate ?? undefined,
            mentionAll: sub.mentionAll ?? undefined,
            mentionMobiles: sub.mentionMobiles,
            mentionUserIds: sub.mentionUserIds,
        })),
        timeoutMs: request.timeoutMs,
        includeSql: request.includeSql,
        messageTemplate: request.messageTemplate ?? undefined,
        mentionAll: request.mentionAll,
        mentionMobiles: request.mentionMobiles,
        mentionUserIds: request.mentionUserIds,
    }
}

export function createHttpPlatformApi(): PlatformApi {
    const paths = API_PATHS.platform

    return {
        listAnalysisCanvas: () =>
            getJson<AnalysisCanvasSummary[]>(paths.analysisCanvas),

        getAnalysisCanvas: (id) =>
            getJson<AnalysisCanvasDetail>(`${paths.analysisCanvas}/${encodeId(id)}`),

        saveAnalysisCanvas: (request) =>
            putJson<AnalysisCanvasDetail>(paths.analysisCanvas, request),

        deleteAnalysisCanvas: (id) =>
            deleteJson<void>(`${paths.analysisCanvas}/${encodeId(id)}`),

        rerunAnalysisCanvas: (request) =>
            postJson<RerunAnalysisCanvasResult>(paths.analysisCanvasRerun, request),

        listSemanticMetrics: (connectionId, database) =>
            getJson<SemanticMetric[]>(paths.semanticMetrics, {connectionId, database}),

        saveSemanticMetric: (request) =>
            putJson<SemanticMetric>(paths.semanticMetrics, request),

        deleteSemanticMetric: (id) =>
            deleteJson<void>(`${paths.semanticMetrics}/${encodeId(id)}`),

        autoGenerateSemanticMetrics: (request) =>
            postJson<SemanticMetric[]>(paths.semanticMetricsAutoGenerate, request),

        searchDiscovery: (q, limit, offset, filters) =>
            getJson<DiscoverySearchPage>(paths.discoverySearch, {
                q: q ?? '',
                ...(limit != null ? {limit: String(limit)} : {}),
                ...(offset != null ? {offset: String(offset)} : {}),
                ...(filters?.kinds?.length ? {kind: filters.kinds.join(',')} : {}),
                ...(filters?.connectionIds?.length ? {connectionId: filters.connectionIds.join(',')} : {}),
                ...(filters?.owners?.length ? {owner: filters.owners.join(',')} : {}),
                ...(filters?.tags?.length ? {tag: filters.tags.join(',')} : {}),
            }),

        reviewSql: (request) =>
            postJson<SqlReviewResult>(paths.sqlReview, request),

        listFederatedViews: () =>
            getJson<FederatedViewSummary[]>(paths.federatedViews),

        getFederatedView: (id) =>
            getJson<FederatedViewDetail>(`${paths.federatedViews}/${encodeId(id)}`),

        saveFederatedView: (request) =>
            putJson<FederatedViewDetail>(paths.federatedViews, request),

        deleteFederatedView: (id) =>
            deleteJson<void>(`${paths.federatedViews}/${encodeId(id)}`),

        executeFederatedView: (request) =>
            postJson<FederatedViewExecuteResult>(paths.federatedViewsExecute, request),

        generateFederatedSql: (request) =>
            postJson<GenerateFederatedSqlResult>(paths.federatedViewsGenerateSql, request),

        analyzeFederatedJoinRisk: (request: AnalyzeFederatedJoinRiskRequest) =>
            postJson<FederatedJoinRiskHints>(paths.federatedViewsAnalyzeRisk, request),

        listSchemaDriftMonitors: () =>
            getJson<SchemaDriftMonitor[]>(paths.schemaDriftMonitors),

        saveSchemaDriftMonitor: (request) =>
            putJson<SchemaDriftMonitor>(paths.schemaDriftMonitors, request),

        deleteSchemaDriftMonitor: (id) =>
            deleteJson<void>(`${paths.schemaDriftMonitors}/${encodeId(id)}`),

        compareSchemaDrift: (request) =>
            postJson<SchemaDriftReport>(paths.schemaDriftCompare, request),

        runSchemaDriftMonitor: (id) =>
            postJson<SchemaDriftReport>(paths.schemaDriftMonitorRun(id), {}),

        listScheduledTasks: async () =>
            (await getJson<ScheduledTaskDto[]>(paths.scheduledTasks) ?? []).map(mapScheduledTask),

        saveScheduledTask: async (request) =>
            mapScheduledTask(
                await putJson<ScheduledTaskDto>(
                    paths.scheduledTasks,
                    toWireSaveScheduledTask(request),
                ),
            ),

        deleteScheduledTask: (id) =>
            deleteJson<void>(`${paths.scheduledTasks}/${encodeId(id)}`),

        runScheduledTask: async (id) =>
            mapScheduledTask(
                await postJson<ScheduledTaskDto>(paths.scheduledTaskRun(id), {}),
            ),

        listDataQualityRules: async (connectionId, database) => {
            const params = new URLSearchParams()
            if (connectionId?.trim()) params.set('connectionId', connectionId.trim())
            if (database?.trim()) params.set('database', database.trim())
            const query = params.toString()
            return (
                await getJson<ScheduledTaskDto[]>(
                    query ? `${paths.dataQualityRules}?${query}` : paths.dataQualityRules,
                ) ?? []
            ).map(mapScheduledTask)
        },

        evaluateDataQualityGate: (request: DataQualityGateRequest) =>
            postJson<DataQualityGateResult>(paths.dataQualityGate, request ?? {}),

        listDataQualityTemplates: () =>
            getJson<DataQualitySharedTemplate[]>(paths.dataQualityTemplates),

        saveDataQualityTemplate: (request: SaveDataQualitySharedTemplateRequest) =>
            putJson<DataQualitySharedTemplate>(paths.dataQualityTemplates, request),

        deleteDataQualityTemplate: (id: string) =>
            deleteJson<void>(paths.dataQualityTemplate(id)),

        pollOrchestrationStatus: async (taskId: string) =>
            mapOrchestrationStatus(
                await postJson<OrchestrationStatusDto>(paths.orchestrationStatus, {taskId}),
            ),

        listQueryLibraryVersions: (teamId, queryId) =>
            getJson<QueryLibraryVersion[]>(paths.queryLibraryVersions(teamId, queryId)),

        saveQueryLibraryVersion: (request) =>
            postJson<QueryLibraryVersion>(paths.queryLibrarySaveVersion, request),

        listOutboundWebhooks: async () =>
            (await getJson<OutboundWebhookDto[]>(paths.outboundWebhooks) ?? []).map(mapWebhook),

        listOutboundWebhookSchema: () =>
            getJson<OutboundEventDefinition[]>(paths.outboundWebhookSchema),

        saveOutboundWebhook: async (request: SaveOutboundWebhookRequest) =>
            mapSaveWebhookResult(
                await putJson<SaveOutboundWebhookResultDto>(
                    paths.outboundWebhooks,
                    toWireSaveWebhook(request),
                ),
            ),

        deleteOutboundWebhook: (id) =>
            deleteJson<void>(`${paths.outboundWebhooks}/${encodeId(id)}`),

        testOutboundWebhook: async (id) =>
            mapWebhookTest(
                await postJson<OutboundWebhookTestResultDto>(paths.outboundWebhookTest(id), {}),
            ),

        createInsightAction: (request: CreateInsightActionRequest) =>
            postJson<InsightActionResult>(paths.insightActions, request),
    }
}
