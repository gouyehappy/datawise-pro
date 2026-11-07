import type {
    AppNotification,
    ConnectionConfig,
    ExportTask,
    NotificationCategory,
    PluginItem,
    SavedConsole,
    SqlLogEntry,
    TableColumn,
    TableRow,
    TeamAuditLog,
    TeamAuditLogQuery,
    TeamInvite,
    TeamJoinRequest,
    TeamMember,
    JoinTeamResult,
    TeamSharedAiSessionDetail,
    TeamSharedAiSessionSummary,
    TeamSharedQueryComment,
    TeamSharedQueryDetail,
    TeamSharedQuerySummary,
    ShareTeamSharedQueryPayload,
    TeamProductionApprovalDetail,
    TeamProductionApprovalSummary,
    SubmitTeamProductionApprovalPayload,
    TeamSummary,
    TreeNode,
} from '@/core/types'
import type {HttpRequestOptions} from '@/shared/api/http/request'
import type {
    AiDatabaseTarget,
    AiChatReplyPayload,
    AiAnalysisContextPayload,
    AiKnowledgeEntry,
    AiTableTagCatalogItem,
} from '@/shared/api/ai.types'
import type {AiEmbeddingProfile, AiLlmSettings, AiPreferences} from '@/shared/config/app-config.types'
import type {HealthSnapshot} from '@/shared/api/http/system'
import type {AppConfigFile} from '@/shared/config/app-config.types'
import type {SqlEditorShortcutsLayer} from '@datawise/sql-editor/types'
import type {UpdatePreferences} from '@/shared/config/update-preferences.types'
import type {ConnectionsCatalog} from '@/shared/config/connections-catalog.types'
import type {DatasourceDefinition, JdbcDriverResolveResult} from '@/shared/api/datasource.types'
import type {
    AnalysisCanvasDetail,
    AnalysisCanvasSummary,
    AutoGenerateSemanticMetricsRequest,
    DiscoveryHit,
    DiscoverySearchPage,
    AnalyzeFederatedJoinRiskRequest,
    ExecuteFederatedViewRequest,
    FederatedJoinRiskHints,
    FederatedViewDetail,
    FederatedViewSummary,
    GenerateFederatedSqlRequest,
    GenerateFederatedSqlResult,
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

// 鈹€鈹€ Auth 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface ApiResponse<T = unknown> {
    code: number
    msg: string
    data: T
}

export interface TenantSummary {
    id: string
    slug: string
    name: string
    status: string
    roleKeys?: string[]
}

export interface TenantAiUsage {
    tenantId: string
    day: string
    calls: number
    limit: number
    remaining: number
    unlimited: boolean
    /** Capability id 鈫?calls today (Wave 29). */
    byCapability?: Record<string, number> | null
}

export interface ShareSnapshot {
    id: string
    title: string
    kind: string
    expiresAt?: string | null
    createdAt?: string | null
    revoked: boolean
}

export interface CreateShareResult {
    id: string
    token: string
    title: string
    kind: string
    expiresAt?: string | null
    createdAt?: string | null
    path: string
}

export interface TenantMember {
    userId: number
    username: string
    status: string
    roleKeys?: string[]
    joinedAt?: string | null
}

export interface LoginResult {
    sessionId: string
    userName?: string
    securityConfigType?: string
    expiresAtEpochMs?: number | null
    userId?: number | null
    admin?: boolean
    featurePermissions?: Record<string, boolean>
    tenantId?: string | null
    tenantName?: string | null
    tenancyMode?: string | null
    platformAdmin?: boolean
    tenants?: TenantSummary[]
    /** True when the account still uses the shipped sample password hash. */
    mustChangePassword?: boolean
}

export interface SessionInfo {
    sessionId: string
    userName: string
    guest: boolean
    expiresAtEpochMs?: number | null
    userId?: number | null
    admin?: boolean
    featurePermissions?: Record<string, boolean>
    tenantId?: string | null
    tenantName?: string | null
    tenancyMode?: string | null
    platformAdmin?: boolean
    tenants?: TenantSummary[]
    /** True when the account has a local password that can unlock the app lock screen. */
    hasLocalPassword?: boolean
    /** True when the account still uses the shipped sample password hash. */
    mustChangePassword?: boolean
}

export interface AuthSessionPolicy {
    ttlMinutes: number
    slidingRenewal: boolean
}

export interface AuthUser {
    userName: string
    userId?: number | null
    displayName: string
    email: string
    isGuest: boolean
    isAdmin?: boolean
}

export interface AuthUserProfile {
    displayName: string
    email: string
}

export interface AuthApi {
    login(userName: string, userPassword: string): Promise<LoginResult>

    loginAsGuest(): Promise<LoginResult>

    register(request: RegisterRequest): Promise<LoginResult>

    signOut(): Promise<void>

    getCurrentSession(options?: HttpRequestOptions): Promise<SessionInfo>

    switchTenant(tenantId: string): Promise<SessionInfo>

    getSessionPolicy(): Promise<AuthSessionPolicy>

    updateSessionPolicy(policy: AuthSessionPolicy): Promise<AuthSessionPolicy>

    changePassword(currentPassword: string, newPassword: string): Promise<void>

    verifyPassword(password: string): Promise<void>

    getLoginOptions(): Promise<AuthLoginOptions>

    getOidcConfig(): Promise<OidcConfig>

    updateOidcConfig(request: SaveOidcConfigRequest): Promise<OidcConfig>

    resolveUserProfile(userName: string, isGuest: boolean): AuthUserProfile
}

export interface AuthLoginOptions {
    localLoginEnabled: boolean
    oidcEnabled: boolean
    oidcProviderLabel?: string | null
    registrationEnabled?: boolean
    tenantCreateEnabled?: boolean
    tenancyMode?: string | null
}

export interface RegisterRequest {
    userName: string
    password: string
    email?: string
    displayName?: string
    tenantName?: string
    tenantSlug?: string
    createTenant?: boolean
}

export interface OidcConfig {
    enabled: boolean
    issuer?: string | null
    clientId?: string | null
    hasClientSecret: boolean
    redirectUri?: string | null
    frontendRedirectBase?: string | null
    scopes?: string | null
    localLoginEnabled: boolean
    tenantClaim?: string | null
    tenantClaimMap?: Record<string, string> | null
    defaultOidcRoleKey?: string | null
    autoProvisionMembership?: boolean
    roleClaim?: string | null
    roleClaimMap?: Record<string, string> | null
    syncRolesFromClaim?: boolean
    deprovisionMissingRoleClaim?: boolean
}

export interface SaveOidcConfigRequest {
    enabled?: boolean
    issuer?: string
    clientId?: string
    clientSecret?: string
    redirectUri?: string
    frontendRedirectBase?: string
    scopes?: string
    localLoginEnabled?: boolean
    tenantClaim?: string
    tenantClaimMap?: Record<string, string>
    defaultOidcRoleKey?: string
    autoProvisionMembership?: boolean
    roleClaim?: string
    roleClaimMap?: Record<string, string>
    syncRolesFromClaim?: boolean
    deprovisionMissingRoleClaim?: boolean
}

export interface OutboundWebhook {
    id: string
    name: string
    enabled: boolean
    channel?: string
    url: string
    hasSecret: boolean
    eventTypes: string[]
    subscriptions?: OutboundWebhookSubscription[]
    timeoutMs: number
    includeSql: boolean
    createdAt?: string | null
    updatedAt?: string | null
    lastSuccessAt?: string | null
    lastFailureAt?: string | null
    lastError?: string | null
    messageTemplate?: string | null
    mentionAll?: boolean
    mentionMobiles?: string[]
    mentionUserIds?: string[]
}

export interface OutboundWebhookSubscription {
    eventType: string
    enabled: boolean
    titleTemplate?: string | null
    bodyTemplate?: string | null
    mentionAll?: boolean | null
    mentionMobiles?: string[]
    mentionUserIds?: string[]
}

export interface OutboundEventVariable {
    name: string
    descriptionZh: string
    descriptionEn: string
}

export interface OutboundEventDefinition {
    type: string
    displayNameZh: string
    displayNameEn: string
    defaultTitleTemplate?: string | null
    defaultBodyTemplate?: string | null
    supportedChannels?: string[]
    variables?: OutboundEventVariable[]
    recommended: boolean
    supportsMentions: boolean
}

export interface SaveOutboundWebhookRequest {
    id?: string
    name: string
    enabled?: boolean
    channel?: string
    url: string
    secret?: string
    eventTypes?: string[]
    subscriptions?: SaveOutboundWebhookSubscription[]
    timeoutMs?: number
    includeSql?: boolean
    messageTemplate?: string | null
    mentionAll?: boolean
    mentionMobiles?: string[]
    mentionUserIds?: string[]
}

export interface SaveOutboundWebhookSubscription {
    eventType: string
    enabled?: boolean
    titleTemplate?: string | null
    bodyTemplate?: string | null
    mentionAll?: boolean | null
    mentionMobiles?: string[]
    mentionUserIds?: string[]
}

export interface OutboundWebhookTestResult {
    ok: boolean
    statusCode: number
    message: string
    responseBody?: string | null
}

export interface SaveOutboundWebhookResult {
    webhook: OutboundWebhook
    confirmationAttempted: boolean
    confirmationSkipped: boolean
    confirmationResult?: OutboundWebhookTestResult | null
}

export interface CreateInsightActionRequest {
    title: string
    body?: string
    data?: Record<string, unknown>
}

export interface InsightActionResult {
    eventId: string
    type: string
    title: string
    ticketUrl?: string | null
    ticketUrls?: string[]
}

export interface UserAdminApi {
    listUsers(): Promise<import('@/shared/auth/feature-permission.types').UserPermissionSummary[]>

    listTenantRoles(): Promise<import('@/shared/auth/feature-permission.types').TenantRoleSummary[]>

    createTenantRole(body: {
        key: string
        name: string
        permissions: import('@/shared/auth/feature-permission.types').FeaturePermissionMap
    }): Promise<import('@/shared/auth/feature-permission.types').TenantRoleSummary>

    updateTenantRole(
        roleId: string,
        body: {
            key?: string
            name: string
            permissions: import('@/shared/auth/feature-permission.types').FeaturePermissionMap
        },
    ): Promise<import('@/shared/auth/feature-permission.types').TenantRoleSummary>

    deleteTenantRole(roleId: string): Promise<void>

    updateUserPermissions(
        userId: number,
        featurePermissions: import('@/shared/auth/feature-permission.types').FeaturePermissionMap,
    ): Promise<import('@/shared/auth/feature-permission.types').UserPermissionSummary>

    updateUserRoles(
        userId: number,
        roleIds: string[],
    ): Promise<import('@/shared/auth/feature-permission.types').UserPermissionSummary>
}

// 鈹€鈹€ SQL 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface ExecuteSqlResult {
    sql: string
    rowCount: number
    durationMs: number
    columns: TableColumn[]
    rows: TableRow[]
    where?: string
    orderBy?: string
    cursorId?: string
    hasMore?: boolean
    pageOffset?: number
    pageSize?: number
}

export type FederatedViewExecuteResult = ExecuteSqlResult

export interface SqlExecuteOptions {
    connectionId?: string
    database?: string
    maxRows?: number
    pageSize?: number
    cursorId?: string
    /** 控制台 Tab ID，用于手动事务模式复用 JDBC 会话 */
    sessionKey?: string
    /** 编辑器执行来源，供后端 PERF 日志区分 toolbar / gutter / shortcut 等 */
    perfSource?: string
    /** Optional AbortSignal for caller cancel (combined with HTTP timeout). */
    signal?: AbortSignal
}

export interface SqlSessionStatus {
    autocommit: boolean
    pending: boolean
    connectionId?: string | null
    database?: string | null
}

export interface SqlSessionOptions {
    sessionKey: string
    connectionId: string
    database?: string
}

export interface SqlGenerateFromPromptOptions {
    connectionId?: string
    database?: string
    prefs?: AiPreferences
}

export interface ActiveSession {
    sessionId: string
    user: string
    host: string
    database: string
    state: string
    command: string
    durationSeconds: number
    sql: string
}

export interface ActiveSessionList {
    sessions: ActiveSession[]
    supported: boolean
    message?: string | null
}

export interface ActiveSessionQuery {
    connectionId: string
    database?: string
}

export interface LockWaitEdge {
    waitingSessionId: string
    blockingSessionId: string
    waitSeconds: number
    waitingSql: string
    blockingSql: string
    waitingUser?: string
    blockingUser?: string
}

export interface LockWaitList {
    edges: LockWaitEdge[]
    supported: boolean
    message?: string | null
}

export interface LockWaitQuery {
    connectionId: string
    database?: string
}

export type SessionKillMode = 'query' | 'connection'

export interface KillSessionRequest {
    connectionId: string
    database?: string
    sessionId: string
    mode?: SessionKillMode
}

export interface KillSessionResult {
    sessionId: string
    mode: SessionKillMode
    sql: string
    killed: boolean
    message: string
}

export interface CancelConsoleSqlRequest {
    sessionKey: string
    mode?: SessionKillMode
}

export interface CancelConsoleSqlResult {
    cancelled: boolean
    mode: SessionKillMode
    message: string
}

export interface SqlApi {
    execute(sql: string, options?: SqlExecuteOptions): Promise<ExecuteSqlResult>

    fetchCursorPage(cursorId: string, pageSize?: number): Promise<ExecuteSqlResult>

    generateFromPrompt(prompt: string, options?: SqlGenerateFromPromptOptions): Promise<string>

    fetchSessionStatus(sessionKey: string): Promise<SqlSessionStatus>

    beginSession(options: SqlSessionOptions): Promise<SqlSessionStatus>

    setSessionAutocommit(options: SqlSessionOptions & { autocommit: boolean }): Promise<SqlSessionStatus>

    commitSession(options: SqlSessionOptions): Promise<SqlSessionStatus>

    rollbackSession(options: SqlSessionOptions): Promise<SqlSessionStatus>

    closeSession(sessionKey: string): Promise<void>

    fetchActiveSessions(query: ActiveSessionQuery): Promise<ActiveSessionList>

    fetchLockWaits(query: LockWaitQuery): Promise<LockWaitList>

    killSession(request: KillSessionRequest): Promise<KillSessionResult>

    cancelExecution(request: CancelConsoleSqlRequest): Promise<CancelConsoleSqlResult>

    /** Best-effort release of a server result cursor when a tab/result is closed. */
    closeCursor(cursorId: string): Promise<void>
}

// 鈹€鈹€ AI 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface AiReplyContext {
    targets?: AiDatabaseTarget[]
    aiPreferences?: AiPreferences
    analysisContext?: AiAnalysisContextPayload
}

export interface LlmTestResult {
    ok: boolean
    message: string
}

export interface AiRagStatus {
    vectorStore: string
    vectorStoreEnabled: boolean
    retrieverAvailable: boolean
    pgvectorConfigured: boolean
    knowledgeEntryCount: number
    message: string
    embeddingProvider?: string
    embeddingConfigured?: boolean
    embeddingDimensions?: number
    serverVectorStore?: string
    userConfigured?: boolean
}

export interface AiRagRebuildResult {
    syncedEntries: number
    message: string
}

export interface AiPythonRuntime {
    enabled: boolean
    executor: string
    sandboxEnabled: boolean
    dependencyInstallEnabled: boolean
    dockerImage: string
    k8sNamespace: string
    timeoutSeconds: number
    dependencyInstallTimeoutSeconds: number
    maxRetries: number
}

export interface AiApi {
    generateReply(prompt: string, context?: AiReplyContext): Promise<AiChatReplyPayload>

    testConnection(settings: AiLlmSettings): Promise<LlmTestResult>
    testEmbedding(profile: AiEmbeddingProfile): Promise<LlmTestResult>

    syncPreferences(prefs: AiPreferences): void

    fetchKnowledgeEntries(): Promise<AiKnowledgeEntry[]>

    saveKnowledgeEntries(
        entries: AiKnowledgeEntry[],
    ): Promise<AiKnowledgeEntry[]>

    fetchRagStatus(connectionId?: string, database?: string): Promise<AiRagStatus>

    rebuildRagIndex(connectionId?: string, database?: string): Promise<AiRagRebuildResult>

    fetchSchemaTables(
        connectionId: string,
        database?: string,
        options?: HttpRequestOptions,
    ): Promise<string[]>

    fetchAiTableTags(connectionId: string, database?: string): Promise<string[]>

    fetchAiTableTagCatalog(): Promise<AiTableTagCatalogItem[]>

    updateAiTableTags(request: {
        connectionId: string
        database: string
        tableNames: string[]
        tagged: boolean
    }): Promise<string[]>

    fetchPythonRuntime(): Promise<AiPythonRuntime>
}

// 鈹€鈹€ Table data 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface TableDataResult {
    columns: TableColumn[]
    rows: TableRow[]
    cursorId?: string
    hasMore?: boolean
    pageOffset?: number
    pageSize?: number
    /** 婊戝姩绐楀彛宸蹭粠鍐呭瓨涓㈠純鐨勬渶鏃╄鏁?*/
    cursorTrimmedRows?: number
}

export interface TableDataFetchOptions {
    connectionId?: string
    database?: string
    maxRows?: number
    cursorId?: string
    /** MongoDB find filter (extended JSON object string) */
    filter?: string
    /** Optional AbortSignal for caller cancel (combined with HTTP timeout). */
    signal?: AbortSignal
}

export interface TableRowMutateRequest {
    connectionId: string
    database?: string
    values: Record<string, string | number | boolean | null>
}

export interface TableRowMutateResult {
    affectedRows: number
    sql: string
}

export interface TableRowUpdateRequest {
    connectionId: string
    database?: string
    keyValues: Record<string, string | number | boolean | null>
    values: Record<string, string | number | boolean | null>
}

export type TableDataChangeOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE'

export interface TableDataChangeAuditEntry {
    id: string
    createdAtMs: number
    operation: TableDataChangeOperation
    beforeRow?: Record<string, string | number | boolean | null> | null
    afterRow?: Record<string, string | number | boolean | null> | null
    primaryKey?: Record<string, string | number | boolean | null> | null
    reverted: boolean
    restoredFromId?: string | null
}

export interface TableDataApi {
    fetch(tableName?: string, options?: TableDataFetchOptions): Promise<TableDataResult>

    insertRow(
        tableName: string,
        request: TableRowMutateRequest,
    ): Promise<TableRowMutateResult>

    updateRow(
        tableName: string,
        request: TableRowUpdateRequest,
    ): Promise<TableRowMutateResult>

    deleteRow(
        tableName: string,
        request: TableRowMutateRequest,
    ): Promise<TableRowMutateResult>

    listAudit(
        tableName: string,
        options: { connectionId: string; database?: string; limit?: number },
    ): Promise<TableDataChangeAuditEntry[]>

    restoreAudit(
        tableName: string,
        auditId: string,
        request: Pick<TableRowMutateRequest, 'connectionId' | 'database'>,
    ): Promise<TableRowMutateResult>
}

export interface TableColumnDetail {
    ordinal: number
    name: string
    dataType: string
    nullable: boolean
    autoIncrement: boolean
    keyType?: string | null
    defaultValue?: string | null
    extra?: string | null
    comment?: string | null
    /** Per-column charset (MySQL family). */
    characterSet?: string | null
    /** Per-column collation (MySQL family). */
    collation?: string | null
}

export interface TableForeignKeyDetail {
    name: string
    columns: string
    referenceTable: string
    referenceColumns: string
}

export interface TableRelationEdge {
    constraintName: string
    sourceTable: string
    sourceColumns: string
    targetTable: string
    targetColumns: string
}

export interface TableRelationsResult {
    tableName: string
    references: TableRelationEdge[]
    referencedBy: TableRelationEdge[]
}

export interface SchemaRelationsResult {
    database: string
    tables: string[]
    edges: TableRelationEdge[]
}

export interface SchemaTableSummary {
    tableName: string
    rowCount: number | null
    engine: string | null
    collation: string | null
    dataLength: number | null
    createTime: string | null
    comment: string | null
}

export interface SchemaTablesResult {
    database: string
    tables: SchemaTableSummary[]
}

export interface TableIndexDetail {
    name: string
    unique: boolean
    columns: string
}

export interface TablePropertiesResult {
    tableName: string
    comment?: string | null
    engine?: string | null
    charset?: string | null
    collation?: string | null
    autoIncrement?: string | null
    columns: TableColumnDetail[]
    foreignKeys: TableForeignKeyDetail[]
    indexes: TableIndexDetail[]
}

export interface TableDdlResult {
    ddl: string
}

export interface TableSqlExportResult {
    sql: string
    fileName: string
}

// 鈹€鈹€ Datagen 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface DatagenPreviewRequest {
    connectionId: string
    database?: string | null
    tableName: string
    rowCount?: number | null
    seed?: number | null
}

export interface DatagenPreviewResult {
    connectionId: string
    database: string
    tableName: string
    rowCount: number
    seed: number
    previewRows: TableRow[]
    insertSql: string
}

export interface DatagenApi {
    previewTableDatagen(request: DatagenPreviewRequest): Promise<DatagenPreviewResult>
    executeTableDatagen(request: DatagenPreviewRequest): Promise<ExecuteSqlResult>
}

export interface MetadataDocPreviewOptions {
    connectionId?: string
    database?: string
    format?: 'md' | 'markdown' | 'html'
    includeDetails?: boolean
}

export interface MetadataDocPreviewResult {
    database: string
    connectionId?: string | null
    format: string
    fileName: string
    markdown: string
    html: string
}

export interface TableMigrationRequest {
    sourceConnectionId: string
    sourceDatabase: string
    targetConnectionId: string
    targetDatabase: string
    tableName: string
    mode?: string
    watermarkColumn?: string
    orderByColumns?: string[]
    whereClause?: string
    batchSize?: number
    throttleMs?: number
    truncateTarget?: boolean
    createTargetIfMissing?: boolean
    sourceSelectSql?: string
    targetTableName?: string
    conflictStrategy?: string
}

export interface TableMigrationBatchTableRequest {
    tableName: string
    createTargetIfMissing?: boolean
}

export interface TableMigrationBatchRequest {
    sourceConnectionId: string
    sourceDatabase: string
    targetConnectionId: string
    targetDatabase: string
    tables: TableMigrationBatchTableRequest[]
    mode?: string
    watermarkColumn?: string
    orderByColumns?: string[]
    whereClause?: string
    batchSize?: number
    throttleMs?: number
    truncateTarget?: boolean
    jobId?: string
    resumeJobId?: string
    conflictStrategy?: string
}

export interface TableMigrationBatchResult {
    jobId?: string | null
    results: TableMigrationResult[]
}

export interface TableMigrationResult {
    tableName: string
    rowsMigrated: number
    batches: number
    durationMs: number
    status: string
    message?: string | null
    sourceRowCount?: number | null
    targetRowCountBefore?: number | null
    targetRowCountAfter?: number | null
    rowCountValidation?: 'match' | 'mismatch' | 'skipped' | string | null
}

export interface TableMigrationPreflightRequest {
    sourceConnectionId: string
    sourceDatabase: string
    targetConnectionId: string
    targetDatabase: string
    tableNames: string[]
    whereClause?: string
}

export interface MigrationColumnTypeMapping {
    columnName: string
    sourceType: string
    targetType: string
    warning?: string | null
}

export interface TableMigrationPreflightTableResult {
    tableName: string
    sourceExists: boolean
    targetExists: boolean
    sourceRowCount: number | null
    targetRowCount: number | null
    sourceColumnCount: number
    targetColumnCount: number
    missingOnTarget: string[]
    extraOnTarget: string[]
    suggestedWatermarkColumns: string[]
    primaryKeyColumns?: string[]
    status: 'ready' | 'warn' | 'blocked' | string
    issues: string[]
    columnMappings: MigrationColumnTypeMapping[]
    suggestedCreateDdl?: string | null
    mappingWarnings: string[]
}

export interface TableMigrationPreflightResult {
    readyCount: number
    warnCount: number
    blockedCount: number
    canProceed: boolean
    tables: TableMigrationPreflightTableResult[]
}

export interface TableMigrationRowDiffRequest {
    sourceConnectionId: string
    sourceDatabase: string
    targetConnectionId: string
    targetDatabase: string
    tableName: string
    whereClause?: string
    sampleLimit?: number
}

export interface TableMigrationRowDiffItem {
    kind: 'insert' | 'update' | 'unchanged' | string
    primaryKey: Record<string, unknown>
    changedColumns: string[]
    sourceValues: Record<string, unknown>
    targetValues?: Record<string, unknown> | null
}

export interface TableMigrationRowDiffResult {
    tableName: string
    primaryKeyColumns: string[]
    sampledSourceRows: number
    insertCount: number
    updateCount: number
    unchangedCount: number
    truncated: boolean
    message?: string | null
    samples: TableMigrationRowDiffItem[]
}

export interface TableDetailFetchOptions {
    connectionId?: string
    database?: string
    kind?: 'table' | 'view'
}

export interface TableSqlExportOptions extends TableDetailFetchOptions {
    includeData?: boolean
    maxRows?: number
}

export interface TableDetailApi {
    fetchProperties(tableName: string, options?: TableDetailFetchOptions): Promise<TablePropertiesResult>

    fetchDdl(tableName: string, options?: TableDetailFetchOptions): Promise<TableDdlResult>

    fetchRelations(tableName: string, options?: TableDetailFetchOptions): Promise<TableRelationsResult>

    fetchSchemaRelations(options?: TableDetailFetchOptions): Promise<SchemaRelationsResult>

    fetchSchemaTables(options?: TableDetailFetchOptions): Promise<SchemaTablesResult>

    exportTableSql(tableName: string, options?: TableSqlExportOptions): Promise<TableSqlExportResult>

    exportDatabaseSql(options: TableSqlExportOptions): Promise<TableSqlExportResult>

    previewDatabaseMetadoc(options: MetadataDocPreviewOptions): Promise<MetadataDocPreviewResult>
}

// 鈹€鈹€ Connection 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface ConnectionTestResult {
    ok: boolean
    message: string
    latencyMs: number
}

export interface ConnectionApi {
    test(config: ConnectionConfig): Promise<ConnectionTestResult>
}

// 鈹€鈹€ Terminal 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export type TerminalOutputLineType = 'out' | 'err' | 'sys'

export interface TerminalOutputLine {
    type: TerminalOutputLineType
    text: string
}

export interface TerminalShellContext {
    cwd: string
    platform: string
}

export interface TerminalExecResult {
    lines: TerminalOutputLine[]
    cwd?: string
}

export interface TerminalStatus {
    websocketEnabled: boolean
    ptyAvailable: boolean
    websocketPath: string
}

export interface TerminalApi {
    execute(input: string, ctx: TerminalShellContext): Promise<TerminalExecResult>

    welcome(platform: string): Promise<string>

    status(): Promise<TerminalStatus>
}

// 鈹€鈹€ Explorer 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface ExplorerFetchOptions {
    refresh?: boolean
}

export interface ExplorerGroupResult {
    groupId: string
    tree: TreeNode[]
}

export interface ExplorerConnectionResult {
    connectionId: string
    tree: TreeNode[]
}

export interface ExplorerImportResult {
    count: number
    tree: TreeNode[]
}

export interface ExplorerLoadChildrenResult {
    tree: TreeNode[]
    hasMore?: boolean
    nextOffset?: number
    etag?: string | null
    unchanged?: boolean
}

export interface ExplorerApi {
    fetchTree(options?: ExplorerFetchOptions): Promise<TreeNode[]>

    loadChildren(
        connectionId: string,
        nodeId: string,
        options?: {
            silent?: boolean
            pattern?: string
            refresh?: boolean
            offset?: number
            limit?: number
            skeleton?: boolean
            ifNoneMatch?: string
        },
    ): Promise<ExplorerLoadChildrenResult>

    fetchRedisKey(
        connectionId: string,
        key: string,
        options?: { database?: number },
    ): Promise<import('@/shared/api/redis.types').RedisKeyDetail>

    fetchRedisKeysScan(
        connectionId: string,
        options?: { pattern?: string; cursor?: string; count?: number; database?: number },
    ): Promise<import('@/shared/api/redis.types').RedisKeysScanResult>

    executeRedisCommand(
        connectionId: string,
        command: string,
        options?: { database?: number },
    ): Promise<import('@/shared/api/redis.types').RedisCommandResult>

    fetchElasticsearchIndices(
        connectionId: string,
    ): Promise<import('@/shared/api/elasticsearch.types').ElasticsearchIndicesResult>

    fetchElasticsearchIndexMetadata(
        connectionId: string,
        index: string,
        options?: { kind?: string },
    ): Promise<import('@/shared/api/elasticsearch.types').ElasticsearchIndexMetadata>

    executeElasticsearchRest(
        connectionId: string,
        requestText: string,
    ): Promise<import('@/shared/api/elasticsearch.types').ElasticsearchRestResult>

    clearElasticsearchIndex(
        connectionId: string,
        index: string,
    ): Promise<import('@/shared/api/elasticsearch.types').ElasticsearchClearIndexResult>

    fetchElasticsearchDocuments(
        connectionId: string,
        index: string,
        options?: { offset?: number; limit?: number; filter?: string },
    ): Promise<import('@/shared/api/types').TableDataResult>

    countElasticsearchDocuments(
        connectionId: string,
        index: string,
        options?: { filter?: string },
    ): Promise<number>

    fetchElasticsearchDocument(
        connectionId: string,
        index: string,
        id: string,
    ): Promise<import('@/shared/api/elasticsearch.types').ElasticsearchDocument>

    upsertElasticsearchDocument(
        connectionId: string,
        index: string,
        payload: { id?: string; sourceJson: string; routing?: string },
    ): Promise<import('@/shared/api/elasticsearch.types').ElasticsearchDocumentMutationResult>

    deleteElasticsearchDocument(
        connectionId: string,
        index: string,
        id: string,
        options?: { routing?: string },
    ): Promise<import('@/shared/api/elasticsearch.types').ElasticsearchDocumentMutationResult>

    fetchKafkaTopics(
        connectionId: string,
        options?: { pattern?: string; limit?: number },
    ): Promise<import('@/shared/api/explorer-ops.types').KafkaTopicsResult>

    fetchKafkaClusterInfo(
        connectionId: string,
    ): Promise<import('@/shared/api/kafka.types').KafkaClusterInfo>

    createKafkaTopic(
        connectionId: string,
        payload: { name: string; partitions?: number; replicationFactor?: number },
    ): Promise<import('@/shared/api/kafka.types').KafkaMutationResult>

    fetchKafkaTopicDetail(
        connectionId: string,
        topic: string,
    ): Promise<import('@/shared/api/kafka.types').KafkaTopicDetail>

    deleteKafkaTopic(
        connectionId: string,
        topic: string,
    ): Promise<import('@/shared/api/kafka.types').KafkaMutationResult>

    increaseKafkaTopicPartitions(
        connectionId: string,
        topic: string,
        partitions: number,
    ): Promise<import('@/shared/api/kafka.types').KafkaMutationResult>

    fetchKafkaTopicConfigs(
        connectionId: string,
        topic: string,
    ): Promise<import('@/shared/api/kafka.types').KafkaTopicConfigs>

    updateKafkaTopicConfigs(
        connectionId: string,
        topic: string,
        payload: { retentionMs?: number | null; retentionBytes?: number | null },
    ): Promise<import('@/shared/api/kafka.types').KafkaMutationResult>

    fetchKafkaMessages(
        connectionId: string,
        topic: string,
        options?: {
            partition?: number
            offset?: number
            limit?: number
            fromBeginning?: boolean
        },
    ): Promise<import('@/shared/api/kafka.types').KafkaMessagesResult>

    produceKafkaMessage(
        connectionId: string,
        topic: string,
        payload: { key?: string; value: string; partition?: number },
    ): Promise<import('@/shared/api/kafka.types').KafkaProduceResult>

    publishTableToKafka(
        connectionId: string,
        payload: import('@/shared/api/kafka.types').PublishTableToKafkaRequest,
        options?: { silent?: boolean },
    ): Promise<import('@/shared/api/kafka.types').PublishTableToKafkaResult>

    fetchKafkaConsumerGroups(
        connectionId: string,
        options?: { pattern?: string; limit?: number },
    ): Promise<import('@/shared/api/kafka.types').KafkaConsumerGroupsResult>

    fetchKafkaConsumerGroupMetrics(
        connectionId: string,
        groupId: string,
        options?: { topic?: string },
    ): Promise<import('@/shared/api/kafka.types').KafkaConsumerGroupMetrics>

    resetKafkaConsumerGroupOffsets(
        connectionId: string,
        groupId: string,
        payload: { topic: string; strategy: 'earliest' | 'latest' },
    ): Promise<import('@/shared/api/kafka.types').KafkaMutationResult>

    fetchYarnClusterInfo(
        connectionId: string,
    ): Promise<import('@/shared/api/yarn.types').YarnClusterInfo>

    fetchYarnApplications(
        connectionId: string,
        options?: { state?: string; user?: string; queue?: string; limit?: number },
    ): Promise<import('@/shared/api/yarn.types').YarnAppsResult>

    fetchYarnApplicationDetail(
        connectionId: string,
        appId: string,
    ): Promise<import('@/shared/api/yarn.types').YarnAppDetail>

    fetchYarnNodes(
        connectionId: string,
        options?: { limit?: number },
    ): Promise<import('@/shared/api/yarn.types').YarnNodesResult>

    fetchYarnQueues(
        connectionId: string,
    ): Promise<import('@/shared/api/yarn.types').YarnQueuesResult>

    killYarnApplication(
        connectionId: string,
        appId: string,
        payload?: { diagnostics?: string },
    ): Promise<import('@/shared/api/explorer-ops.types').YarnMutationResult>

    moveYarnApplicationQueue(
        connectionId: string,
        appId: string,
        payload: { queue: string },
    ): Promise<import('@/shared/api/explorer-ops.types').YarnMutationResult>

    updateYarnQueue(
        connectionId: string,
        payload: { queueName: string; params: Record<string, string> },
    ): Promise<import('@/shared/api/explorer-ops.types').YarnMutationResult>

    removeYarnQueue(
        connectionId: string,
        payload: { queueName: string },
    ): Promise<import('@/shared/api/explorer-ops.types').YarnMutationResult>

    fetchJenkinsInfo(
        connectionId: string,
    ): Promise<import('@/shared/api/jenkins.types').JenkinsInfo>

    fetchJenkinsViews(
        connectionId: string,
    ): Promise<import('@/shared/api/jenkins.types').JenkinsViewsResult>

    fetchJenkinsJobs(
        connectionId: string,
        options?: { name?: string; limit?: number; view?: string; folder?: string; browse?: boolean },
    ): Promise<import('@/shared/api/jenkins.types').JenkinsJobsResult>

    fetchJenkinsJobDetail(
        connectionId: string,
        jobName: string,
    ): Promise<import('@/shared/api/jenkins.types').JenkinsJobDetail>

    triggerJenkinsBuild(
        connectionId: string,
        jobName: string,
        payload?: { parameters?: Record<string, string> },
    ): Promise<import('@/shared/api/jenkins.types').JenkinsMutationResult>

    stopJenkinsBuild(
        connectionId: string,
        jobName: string,
        buildNumber: number,
    ): Promise<import('@/shared/api/jenkins.types').JenkinsMutationResult>

    fetchJenkinsBuildLog(
        connectionId: string,
        jobName: string,
        buildNumber: number,
        options?: { start?: number },
    ): Promise<import('@/shared/api/jenkins.types').JenkinsBuildLog>

    fetchJenkinsQueue(
        connectionId: string,
        options?: { name?: string },
    ): Promise<import('@/shared/api/jenkins.types').JenkinsQueueResult>

    fetchJenkinsNodes(
        connectionId: string,
    ): Promise<import('@/shared/api/jenkins.types').JenkinsNodesResult>

    fetchNacosInfo(
        connectionId: string,
    ): Promise<import('@/shared/api/nacos.types').NacosInfo>

    fetchNacosNamespaces(
        connectionId: string,
    ): Promise<import('@/shared/api/nacos.types').NacosNamespacesResult>

    detectNacosNamespaces(
        config: import('@/core/types').ConnectionConfig,
    ): Promise<import('@/shared/api/nacos.types').NacosNamespacesResult>

    fetchNacosConfigs(
        connectionId: string,
        options?: { namespaceId?: string; dataId?: string; group?: string; limit?: number },
    ): Promise<import('@/shared/api/nacos.types').NacosConfigsResult>

    fetchNacosConfig(
        connectionId: string,
        options: { dataId: string; group?: string; namespaceId?: string },
    ): Promise<import('@/shared/api/nacos.types').NacosConfigDetail>

    updateNacosConfig(
        connectionId: string,
        payload: {
            dataId: string
            group?: string
            namespaceId?: string
            content: string
            type?: string
        },
    ): Promise<import('@/shared/api/nacos.types').NacosConfigDetail>

    fetchNacosServices(
        connectionId: string,
        options?: { namespaceId?: string; limit?: number },
    ): Promise<import('@/shared/api/nacos.types').NacosServicesResult>

    fetchNacosInstances(
        connectionId: string,
        options: { serviceName: string; groupName?: string; namespaceId?: string },
    ): Promise<import('@/shared/api/nacos.types').NacosInstancesResult>

    fetchPolarisInfo(
        connectionId: string,
    ): Promise<import('@/shared/api/polaris.types').PolarisInfo>

    fetchPolarisNamespaces(
        connectionId: string,
    ): Promise<import('@/shared/api/polaris.types').PolarisNamespacesResult>

    fetchPolarisServices(
        connectionId: string,
        options?: { namespace?: string; limit?: number },
    ): Promise<import('@/shared/api/polaris.types').PolarisServicesResult>

    fetchPolarisInstances(
        connectionId: string,
        options: { namespace: string; service: string; limit?: number },
    ): Promise<import('@/shared/api/polaris.types').PolarisInstancesResult>

    fetchPolarisConfigs(
        connectionId: string,
        options?: { namespace?: string; group?: string; name?: string; limit?: number },
    ): Promise<import('@/shared/api/polaris.types').PolarisConfigsResult>

    fetchPolarisConfig(
        connectionId: string,
        options: { name: string; group?: string; namespace?: string },
    ): Promise<import('@/shared/api/polaris.types').PolarisConfigDetail>

    updatePolarisConfig(
        connectionId: string,
        payload: {
            name: string
            namespace?: string
            group?: string
            content: string
            format?: string
        },
    ): Promise<import('@/shared/api/polaris.types').PolarisConfigDetail>

    fetchK8sClusterInfo(
        connectionId: string,
    ): Promise<import('@/shared/api/k8s.types').K8sClusterInfo>

    fetchK8sNamespaces(
        connectionId: string,
        options?: { name?: string; limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sNamespacesResult>

    fetchK8sPods(
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; fieldSelector?: string; limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sPodsResult>

    fetchK8sPodDetail(
        connectionId: string,
        namespace: string,
        podName: string,
        options?: { silent?: boolean },
    ): Promise<import('@/shared/api/k8s.types').K8sPodDetail>

    fetchK8sPodLogs(
        connectionId: string,
        namespace: string,
        podName: string,
        options?: { container?: string; tailLines?: number; silent?: boolean },
    ): Promise<import('@/shared/api/k8s.types').K8sLogs>

    fetchK8sDeployments(
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sDeploymentsResult>

    fetchK8sServices(
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sServicesResult>

    fetchK8sConfigMaps(
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sConfigMapsResult>

    fetchK8sSecrets(
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sSecretsResult>

    fetchK8sEvents(
        connectionId: string,
        namespace: string,
        options?: { involvedName?: string; limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sEventsResult>

    fetchK8sCrds(
        connectionId: string,
        options?: { name?: string; limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sCrdsResult>

    fetchK8sHelmReleases(
        connectionId: string,
        namespace: string,
        options?: { limit?: number },
    ): Promise<import('@/shared/api/k8s.types').K8sHelmReleasesResult>

    applyK8sYaml(
        connectionId: string,
        yaml: string,
        namespace?: string,
    ): Promise<import('@/shared/api/k8s.types').K8sApplyResult>

    deleteK8sPod(
        connectionId: string,
        namespace: string,
        podName: string,
    ): Promise<import('@/shared/api/k8s.types').K8sMutationResult>

    restartK8sDeployment(
        connectionId: string,
        namespace: string,
        deploymentName: string,
    ): Promise<import('@/shared/api/k8s.types').K8sMutationResult>

    fetchConnection(connectionId: string): Promise<ConnectionConfig>

    connectConnection(connectionId: string): Promise<ConnectionTestResult>

    pingConnection(connectionId: string): Promise<ConnectionTestResult>

    /** 浠呭埛鏂板凡寤烘睜杩炴帴娲昏穬鏃堕棿锛涙湭杩炴帴杩斿洖 false锛屼笉鑷姩 connect */
    touchConnection(connectionId: string): Promise<boolean>

    disconnectConnection(connectionId: string): Promise<void>

    listPooledConnections(): Promise<string[]>

    reconnectConnection(connectionId: string): Promise<ConnectionTestResult>

    createGroup(label: string, parentId?: string): Promise<ExplorerGroupResult>

    updateGroup(groupId: string, label: string): Promise<TreeNode[]>

    createConnection(config: ConnectionConfig, groupId?: string): Promise<ExplorerConnectionResult>

    updateConnection(connectionId: string, config: ConnectionConfig): Promise<TreeNode[]>

    moveConnection(connectionId: string, targetGroupId: string): Promise<TreeNode[]>

    reorderCatalogNode(
        nodeId: string,
        targetId: string,
        position: 'before' | 'after' | 'inside',
    ): Promise<TreeNode[]>

    deleteNode(nodeId: string): Promise<TreeNode[]>

    importConnections(configs: ConnectionConfig[]): Promise<ExplorerImportResult>

    createDatabase(
        connectionId: string,
        payload: { name: string; charset?: string; collation?: string },
    ): Promise<CreateNamespaceResult>

    deleteDatabase(connectionId: string, name: string): Promise<CreateNamespaceResult>

    createSchema(
        connectionId: string,
        payload: { name: string; catalog?: string },
    ): Promise<CreateNamespaceResult>

    fetchMysqlCharsets(connectionId: string): Promise<MysqlCharsetOptionsResult>
}

export interface CreateNamespaceResult {
    name: string
    kind: string
    sql: string
    created: boolean
}

export interface MysqlCharsetOptionsResult {
    charsets: Array<{ name: string; description: string; defaultCollation: string }>
    collations: Array<{ name: string; charset: string; isDefault: boolean }>
}

// 鈹€鈹€ Workspace (shortcut panel) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface SaveInstanceSqlPayload {
    connectionId: string
    instanceId?: string
    instanceName?: string
    sql: string
    fileName?: string
}

export interface SaveInstanceSqlResult {
    relativePath: string
    fileName: string
    directory: string
}

export interface ReadInstanceSqlPayload {
    connectionId: string
    instanceName: string
    fileName?: string
}

export interface DeleteInstanceSqlPayload {
    connectionId: string
    instanceName: string
    fileName: string
}

export interface ReadInstanceSqlResult {
    sql: string
    fileName: string
    relativePath: string
}

export interface InstanceSqlFileItem {
    connectionId: string
    instanceName: string
    fileName: string
    relativePath: string
    modifiedAt: number
    preview: string
}

export interface ListInstanceSqlScriptsPayload {
    connectionId: string
    instanceName: string
    allConnections?: boolean
}

export interface RenameInstanceSqlPayload {
    connectionId: string
    instanceName: string
    oldFileName: string
    newFileName: string
}

export interface InstanceSqlHistoryEntry {
    versionId: string
    savedAt: number
    preview: string
    sizeBytes: number
}

export interface RestoreInstanceSqlHistoryPayload {
    connectionId: string
    instanceName: string
    fileName: string
    versionId: string
}

export interface ReadInstanceSqlHistoryPayload {
    connectionId: string
    instanceName: string
    fileName: string
    versionId: string
}

export interface SaveViewModelPayload {
    connectionId: string
    instanceId?: string
    instanceName?: string
    name: string
    sql: string
}

export interface SaveViewModelResult {
    relativePath: string
    name: string
    fileName: string
    directory: string
    draft?: boolean
}

export interface ReadViewModelPayload {
    connectionId: string
    instanceName: string
    name: string
}

export interface ReadViewModelResult {
    sql: string
    name: string
    fileName: string
    relativePath: string
    draft?: boolean
}

export interface ViewModelFileItem {
    connectionId: string
    instanceName: string
    name: string
    fileName: string
    relativePath: string
    modifiedAt: number
    preview: string
}

export interface ListViewModelsPayload {
    connectionId: string
    instanceName: string
}

export interface RenameViewModelPayload {
    connectionId: string
    instanceName: string
    oldName: string
    newName: string
}

export interface DeleteViewModelPayload {
    connectionId: string
    instanceName: string
    name: string
}

export interface WorkspaceSettings {
    scriptsDir: string
    scriptsDirResolved: string
}

export interface SlowSqlEntry {
    id: string
    sql: string
    connectionId?: string
    durationMs: number
    rowCount?: number
    executedAt: string
    teamShared?: boolean
}

export interface SqlStatsTrendPoint {
    date: string
    runCount: number
    avgDurationMs: number
    maxDurationMs: number
}

export interface SqlExecutionStats {
    slowQueries: SlowSqlEntry[]
    trend: SqlStatsTrendPoint[]
    totalRuns: number
    avgDurationMs: number
    slowThresholdMs: number
    days: number
}

export interface SqlStatsQuery {
    connectionId?: string
    days?: number
    limit?: number
    slowThresholdMs?: number
}

export interface WorkspaceApi {
    fetchSqlLogs(): Promise<SqlLogEntry[]>

    appendSqlLog(entry: Omit<SqlLogEntry, 'id'>, connectionId?: string): Promise<SqlLogEntry>

    fetchSavedConsoles(): Promise<SavedConsole[]>

    saveConsole(payload: {
        name: string
        connectionName: string
        sql: string
        folder?: string
        tags?: string[]
    }): Promise<SavedConsole>

    saveInstanceSql(payload: SaveInstanceSqlPayload): Promise<SaveInstanceSqlResult>

    readInstanceSql(payload: ReadInstanceSqlPayload): Promise<ReadInstanceSqlResult>

    readLatestInstanceSql(payload: Omit<ReadInstanceSqlPayload, 'fileName'>): Promise<ReadInstanceSqlResult>

    listInstanceSqlScripts(payload: ListInstanceSqlScriptsPayload): Promise<InstanceSqlFileItem[]>

    renameInstanceSql(payload: RenameInstanceSqlPayload): Promise<SaveInstanceSqlResult>

    deleteInstanceSql(payload: DeleteInstanceSqlPayload): Promise<void>

    listInstanceSqlHistory(payload: ReadInstanceSqlPayload): Promise<InstanceSqlHistoryEntry[]>

    readInstanceSqlHistoryVersion(payload: ReadInstanceSqlHistoryPayload): Promise<ReadInstanceSqlResult>

    restoreInstanceSqlHistory(payload: RestoreInstanceSqlHistoryPayload): Promise<ReadInstanceSqlResult>

    saveViewModel(payload: SaveViewModelPayload): Promise<SaveViewModelResult>

    saveViewModelDraft(payload: SaveViewModelPayload): Promise<SaveViewModelResult>

    readViewModel(payload: ReadViewModelPayload): Promise<ReadViewModelResult>

    listViewModels(payload: ListViewModelsPayload): Promise<ViewModelFileItem[]>

    renameViewModel(payload: RenameViewModelPayload): Promise<SaveViewModelResult>

    deleteViewModel(payload: DeleteViewModelPayload): Promise<void>

    fetchWorkspaceSettings(): Promise<WorkspaceSettings>

    fetchExportTasks(): Promise<ExportTask[]>

    createExportTask(
        fileName: string,
        options?: { clientCompleted?: boolean; fileSize?: number },
    ): Promise<ExportTask>

    fetchSqlStats(query?: SqlStatsQuery): Promise<SqlExecutionStats>
}

// 鈹€鈹€ Notifications 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface NotificationPushInput {
    category: NotificationCategory
    titleKey: string
    bodyKey: string
    params?: Record<string, string | number>
}

export interface NotificationApi {
    fetchAll(): Promise<AppNotification[]>

    push(input: NotificationPushInput): Promise<AppNotification>

    markAllRead(): Promise<void>

    markRead(id: string): Promise<void>

    remove(id: string): Promise<void>

    clearRead(): Promise<void>

    clearAll(): Promise<void>
}

// 鈹€鈹€ Datasources 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface JdbcDriverResolveRequest {
    mavenCoordinates: string
    driverClass: string
}

export interface DatasourcesApi {
    list(): Promise<{
        datasources: DatasourceDefinition[]
        loadedPluginJars?: string[]
        pluginLoadFailures?: Array<{jarName: string; reason: string}>
    }>

    market(): Promise<{
        connectors: import('@/shared/api/datasource.types').ConnectorMarketEntry[]
        loadedPluginJars?: string[]
        pluginLoadFailures?: Array<{jarName: string; reason: string}>
        manifest?: {
            schemaVersion: number
            updatedAt?: string
            channel?: string
            pluginCount: number
        } | null
    }>

    fetchExplorerUiCatalog(): Promise<
        import('@/shared/api/explorer-ui-catalog.types').ConnectorExplorerUiCatalog
    >

    resolveDriver(request: JdbcDriverResolveRequest): Promise<JdbcDriverResolveResult>

    installDriver(request: JdbcDriverResolveRequest): Promise<JdbcDriverResolveResult>

    driverProgress(mavenCoordinates: string): Promise<
        import('@/shared/api/datasource.types').JdbcDriverDownloadProgress
    >

    listDrivers(): Promise<import('@/shared/api/datasource.types').JdbcDriverCatalog>

    deleteDriver(relativePath: string): Promise<{deleted: boolean; relativePath: string}>

    deleteDriverBundle(bundleDir: string): Promise<{deletedCount: number; bundleDir: string}>

    deleteDriverFamily(familyId: string): Promise<{deletedCount: number; familyId: string}>

    installFromMarket(connectorId: string): Promise<
        import('@/shared/api/datasource.types').InstallConnectorPluginResult
    >

    installFromMarketBatch(connectorIds: string[]): Promise<
        import('@/shared/api/datasource.types').InstallConnectorBatchResult
    >

    uninstallFromMarket(connectorId: string): Promise<
        import('@/shared/api/datasource.types').UninstallConnectorPluginResult
    >

    cleanupRedundantPlugins(): Promise<{
        deletedCount: number
        deletedJars: string[]
        failedJars: string[]
        message: string
    }>

    pluginLoadStatus(): Promise<{
        phase: string
        ready: boolean
        loadedJarCount: number
        loadedConnectorCount: number
        failureCount: number
    }>

    reloadPlugins(): Promise<{
        loadedJarCount: number
        loadedConnectorIds: string[]
        failures: Array<{jarName: string; reason: string}>
    }>

    clearQuarantinedPlugins(): Promise<{
        loadedJarCount: number
        loadedConnectorIds: string[]
        failures: Array<{jarName: string; reason: string}>
    }>
}

export interface RuntimeApi {
    overview(): Promise<import('@/shared/api/datasource.types').RuntimeOverview>

    jre(): Promise<import('@/shared/api/datasource.types').RuntimeOverview['jre']>

    importOffline(path: string): Promise<import('@/shared/api/datasource.types').RuntimeOfflineImportResult>
}

// 鈹€鈹€ Plugins & teams 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface PluginApi {
    fetchAll(): Promise<PluginItem[]>
}

/** App-level narrow of OpenAPI pack `state: string`. */
export type PackAccessStateDto =
    | 'active'
    | 'trial'
    | 'locked'
    | 'expired'
    | 'not_installed'

/** Wire DTOs 鈥?sourced from OpenAPI (`shared/api/generated`), not hand-maintained. */
export type PackRuntimeStatusDto = import('@/shared/api/generated').PackRuntimeStatusDto
export type EntitlementSnapshotDto = import('@/shared/api/generated').EntitlementSnapshotDto
export type PackAuditEventDto = import('@/shared/api/generated').PackAuditEventDto

export interface PacksApi {
    fetchEntitlement(): Promise<EntitlementSnapshotDto>
    fetchCatalog(): Promise<EntitlementSnapshotDto>
    activateLicense(licenseKey: string): Promise<EntitlementSnapshotDto>
    startTrial(packId: string): Promise<EntitlementSnapshotDto>
    claimSiteProTrial(): Promise<EntitlementSnapshotDto>
    installPack(packId: string, version?: string): Promise<EntitlementSnapshotDto>
    installDpk(path: string): Promise<EntitlementSnapshotDto>
    uninstallPack(packId: string): Promise<EntitlementSnapshotDto>
    fetchAudit(limit?: number): Promise<PackAuditEventDto[]>
}

export interface TeamApi {
    fetchAll(): Promise<TeamSummary[]>

    create(name: string): Promise<TeamSummary>

    join(code: string): Promise<JoinTeamResult>

    fetchJoinRequests(): Promise<TeamJoinRequest[]>

    fetchMembers(teamId: string): Promise<TeamMember[]>

    updateMemberRole(teamId: string, userId: number, role: TeamMember['role']): Promise<TeamMember>

    fetchInvites(teamId: string): Promise<TeamInvite[]>

    approveInvite(teamId: string, inviteId: string): Promise<TeamSummary>

    rejectInvite(teamId: string, inviteId: string): Promise<TeamSummary>

    updateSettings(teamId: string, requireInviteApproval: boolean): Promise<TeamSummary>

    fetchAuditLogs(teamId: string, query?: TeamAuditLogQuery): Promise<TeamAuditLog[]>

    exportAuditLogs(
        teamId: string,
        options: {
            format: 'csv' | 'json'
            actorUserId?: number
            since?: string
            until?: string
            includeFullSql?: boolean
            fileName?: string
        },
    ): Promise<void>

    updateSharedConnections(
        teamId: string,
        connectionIds: string[],
        connectionAccess?: Record<string, 'readonly' | 'readwrite' | 'ddl' | 'read' | 'write'>,
    ): Promise<TeamSummary>

    updateOnCallConnections(teamId: string, connectionIds: string[]): Promise<TeamSummary>

    updateSharedConsoles(teamId: string, consoleIds: string[]): Promise<TeamSummary>

    updateVisibleProjects(teamId: string, projectIds: string[]): Promise<TeamSummary>

    updateShareSqlHistory(teamId: string, enabled: boolean): Promise<TeamSummary>

    fetchSharedAiSessions(teamId: string): Promise<TeamSharedAiSessionSummary[]>

    getSharedAiSession(teamId: string, sessionId: string): Promise<TeamSharedAiSessionDetail>

    shareAiSession(teamId: string, title: string, payloadJson: string): Promise<TeamSharedAiSessionSummary>

    fetchSharedQueries(teamId: string): Promise<TeamSharedQuerySummary[]>

    getSharedQuery(teamId: string, queryId: string): Promise<TeamSharedQueryDetail>

    shareQuery(teamId: string, payload: ShareTeamSharedQueryPayload): Promise<TeamSharedQuerySummary>

    updateSharedQuery(
        teamId: string,
        queryId: string,
        payload: ShareTeamSharedQueryPayload,
    ): Promise<TeamSharedQuerySummary>

    deleteSharedQuery(teamId: string, queryId: string): Promise<void>

    addSharedQueryComment(
        teamId: string,
        queryId: string,
        content: string,
    ): Promise<TeamSharedQueryComment>

    deleteSharedQueryComment(teamId: string, queryId: string, commentId: string): Promise<void>

    toggleSharedQueryFavorite(teamId: string, queryId: string): Promise<TeamSharedQuerySummary>

    fetchProductionApprovals(
        teamId: string,
        status?: TeamProductionApprovalSummary['status'],
    ): Promise<TeamProductionApprovalSummary[]>

    getProductionApproval(teamId: string, approvalId: string): Promise<TeamProductionApprovalDetail>

    submitProductionApproval(
        teamId: string,
        payload: SubmitTeamProductionApprovalPayload,
    ): Promise<TeamProductionApprovalSummary>

    approveProductionApproval(teamId: string, approvalId: string): Promise<TeamProductionApprovalDetail>

    rejectProductionApproval(
        teamId: string,
        approvalId: string,
        comment?: string,
    ): Promise<TeamProductionApprovalDetail>
}

// 鈹€鈹€ System 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface SystemJvmMetrics {
    availableProcessors: number
    heapUsedBytes: number
    heapMaxBytes: number
    heapUsagePercent?: number | null
}

export interface SystemDatawiseMetrics {
    jdbcPoolsActive: number
    explorerSchemaSessionsActive: number
    explorerLoadChildrenNotModifiedShortCircuit: number
    explorerLoadChildrenNotModifiedAfterLoad: number
    explorerLoadChildrenModified: number
}

export interface SystemJdbcPoolMetrics {
    poolName: string
    connectionId: string
    activeConnections?: number | null
    idleConnections?: number | null
    pendingThreads?: number | null
    maxConnections?: number | null
    minConnections?: number | null
}

export interface SystemMetricsSnapshot {
    collectedAt: string
    healthStatus: string
    uptimeMs: number
    jvm: SystemJvmMetrics
    datawise: SystemDatawiseMetrics
    jdbcPools: SystemJdbcPoolMetrics[]
}

export interface DeploymentCheck {
    id: string
    currentValue: string
    recommendedValue: string
    status: 'ok' | 'warn' | 'info' | string
    docsHint?: string
}

export interface DeploymentProfileSnapshot {
    activeProfiles: string[]
    mode: string
    checks: DeploymentCheck[]
    okCount: number
    warnCount: number
    infoCount: number
    pythonSimulated: boolean
}

export interface LegacyConfigMigrationItem {
    legacyRelativePath: string
    targetRelativePath: string
    kind: string
}

export interface LegacyConfigMigrationStatus {
    pendingCount: number
    pending: LegacyConfigMigrationItem[]
    migrated: LegacyConfigMigrationItem[]
}

export interface SystemApi {
    ping(): Promise<HealthSnapshot>

    /** 鎺㈡祴鎸囧畾鍩哄潃鐨勫仴搴锋鏌ワ紙淇濆瓨鍓嶈瘯杩炰簯绔級 */
    pingAt(baseUrl: string): Promise<HealthSnapshot>

    resolveEndpointLabel(): string

    fetchMetrics(): Promise<SystemMetricsSnapshot>

    fetchDeploymentProfile(): Promise<DeploymentProfileSnapshot>

    fetchConfigMigrationStatus(): Promise<LegacyConfigMigrationStatus>

    applyConfigMigration(): Promise<LegacyConfigMigrationStatus>

    fetchSecretsStatus(): Promise<import('@/shared/api/http/system').SecretsStatus>
}

export interface ConfigApi {
    fetchAppConfig(): Promise<AppConfigFile | null>

    saveAppConfig(config: AppConfigFile): Promise<void>

    fetchAppConfigXml(): Promise<string>

    saveAppConfigXml(xml: string): Promise<void>

    fetchWorkspaceSession(): Promise<import('@/shared/config/app-config.types').WorkspaceSessionFile | null>

    saveWorkspaceSession(session: import('@/shared/config/app-config.types').WorkspaceSessionFile): Promise<void>

    fetchAiPreferences(): Promise<import('@/shared/config/app-config.types').AiPreferences | null>

    saveAiPreferences(prefs: import('@/shared/config/app-config.types').AiPreferences): Promise<void>

    fetchExplorerUi(): Promise<import('@/shared/config/app-config.types').ExplorerPreferences | null>

    saveExplorerUi(prefs: import('@/shared/config/app-config.types').ExplorerPreferences): Promise<void>

    fetchWindow(): Promise<import('@/shared/config/app-config.types').WindowPreferences | null>

    saveWindow(prefs: import('@/shared/config/app-config.types').WindowPreferences): Promise<void>

    fetchLocalFiles(): Promise<import('@/shared/config/app-config.types').LocalFilesPreferences | null>

    saveLocalFiles(prefs: import('@/shared/config/app-config.types').LocalFilesPreferences): Promise<void>

    fetchSqlSnippets(layer: 'shared' | 'personal'): Promise<SqlEditorShortcutsLayer | null>

    saveSqlSnippets(layer: 'shared' | 'personal', payload: SqlEditorShortcutsLayer): Promise<void>

    fetchUpdaterPreferences(): Promise<UpdatePreferences>

    saveUpdaterPreferences(prefs: UpdatePreferences): Promise<void>

    fetchConnectionsCatalog(): Promise<ConnectionsCatalog>

    saveConnectionsCatalog(catalog: ConnectionsCatalog): Promise<void>

    fetchConnectionsXml(): Promise<string>

    saveConnectionsXml(xml: string): Promise<void>
}

export interface MigrationTableCheckpoint {
    tableName: string
    status: string
    lastOffset: number
    rowsMigrated: number
    batchesCompleted: number
    lastWatermark?: string | null
    lastSeekKey?: string | null
    requestFingerprint?: string | null
    updatedAt?: string | null
}

export interface MigrationJobView {
    id: string
    status: string
    tablesPlanned: string[]
    tables: Record<string, MigrationTableCheckpoint>
    results: TableMigrationResult[]
    createdAt?: string | null
    updatedAt?: string | null
}

export interface MigrationApi {
    migrateTable(request: TableMigrationRequest): Promise<TableMigrationResult>

    migrateTablesBatch(request: TableMigrationBatchRequest): Promise<TableMigrationBatchResult>

    preflight(request: TableMigrationPreflightRequest): Promise<TableMigrationPreflightResult>

    rowDiff(request: TableMigrationRowDiffRequest): Promise<TableMigrationRowDiffResult>

    getJob(jobId: string): Promise<MigrationJobView>

    listJobs(): Promise<MigrationJobView[]>

    startJob(request: TableMigrationBatchRequest): Promise<MigrationJobView>

    pauseJob(jobId: string): Promise<MigrationJobView>

    cancelJob(jobId: string): Promise<MigrationJobView>

    resumeJob(jobId: string): Promise<MigrationJobView>
}

// 鈹€鈹€ Platform 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface PlatformApi {
    listAnalysisCanvas(): Promise<AnalysisCanvasSummary[]>

    getAnalysisCanvas(id: string): Promise<AnalysisCanvasDetail>

    saveAnalysisCanvas(request: SaveAnalysisCanvasRequest): Promise<AnalysisCanvasDetail>

    deleteAnalysisCanvas(id: string): Promise<void>

    rerunAnalysisCanvas(request: RerunAnalysisCanvasRequest): Promise<RerunAnalysisCanvasResult>

    listSemanticMetrics(connectionId?: string, database?: string): Promise<SemanticMetric[]>

    saveSemanticMetric(request: SaveSemanticMetricRequest): Promise<SemanticMetric>

    deleteSemanticMetric(id: string): Promise<void>

    autoGenerateSemanticMetrics(request: AutoGenerateSemanticMetricsRequest): Promise<SemanticMetric[]>

    searchDiscovery(
        q?: string | null,
        limit?: number,
        offset?: number,
        filters?: import('@/shared/api/platform.types').DiscoverySearchFilters,
    ): Promise<DiscoverySearchPage>

    reviewSql(request: SqlReviewRequest): Promise<SqlReviewResult>

    listFederatedViews(): Promise<FederatedViewSummary[]>

    getFederatedView(id: string): Promise<FederatedViewDetail>

    saveFederatedView(request: SaveFederatedViewRequest): Promise<FederatedViewDetail>

    deleteFederatedView(id: string): Promise<void>

    executeFederatedView(request: ExecuteFederatedViewRequest): Promise<ExecuteSqlResult>

    generateFederatedSql(request: GenerateFederatedSqlRequest): Promise<GenerateFederatedSqlResult>

    analyzeFederatedJoinRisk(request: AnalyzeFederatedJoinRiskRequest): Promise<FederatedJoinRiskHints>

    listSchemaDriftMonitors(): Promise<SchemaDriftMonitor[]>

    saveSchemaDriftMonitor(request: SaveSchemaDriftMonitorRequest): Promise<SchemaDriftMonitor>

    deleteSchemaDriftMonitor(id: string): Promise<void>

    compareSchemaDrift(request: SchemaDriftCompareRequest): Promise<SchemaDriftReport>

    runSchemaDriftMonitor(id: string): Promise<SchemaDriftReport>

    listScheduledTasks(): Promise<ScheduledTask[]>

    saveScheduledTask(request: SaveScheduledTaskRequest): Promise<ScheduledTask>

    deleteScheduledTask(id: string): Promise<void>

    runScheduledTask(id: string): Promise<ScheduledTask>

    listDataQualityRules(connectionId?: string, database?: string): Promise<ScheduledTask[]>

    evaluateDataQualityGate(request: DataQualityGateRequest): Promise<DataQualityGateResult>

    listDataQualityTemplates(): Promise<DataQualitySharedTemplate[]>

    saveDataQualityTemplate(request: SaveDataQualitySharedTemplateRequest): Promise<DataQualitySharedTemplate>

    deleteDataQualityTemplate(id: string): Promise<void>

    pollOrchestrationStatus(taskId: string): Promise<OrchestrationStatusResult>

    listQueryLibraryVersions(teamId: string, queryId: string): Promise<QueryLibraryVersion[]>

    saveQueryLibraryVersion(request: SaveQueryLibraryVersionRequest): Promise<QueryLibraryVersion>

    listOutboundWebhooks(): Promise<OutboundWebhook[]>
        listOutboundWebhookSchema(): Promise<OutboundEventDefinition[]>

    saveOutboundWebhook(request: SaveOutboundWebhookRequest): Promise<SaveOutboundWebhookResult>

    deleteOutboundWebhook(id: string): Promise<void>

    testOutboundWebhook(id: string): Promise<OutboundWebhookTestResult>

    createInsightAction(request: CreateInsightActionRequest): Promise<InsightActionResult>
}

// 鈹€鈹€ Client 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface ApiClient {
    auth: AuthApi
    userAdmin: UserAdminApi
    sql: SqlApi
    ai: AiApi
    datagen: DatagenApi
    tableData: TableDataApi
    tableDetail: TableDetailApi
    connection: ConnectionApi
    terminal: TerminalApi
    explorer: ExplorerApi
    workspace: WorkspaceApi
    notifications: NotificationApi
    plugins: PluginApi
    packs: PacksApi
    teams: TeamApi
    system: SystemApi
    config: ConfigApi
    datasources: DatasourcesApi
    runtime: RuntimeApi
    migration: MigrationApi
    platform: PlatformApi
    lineage: import('@/shared/api/http/lineage').LineageApi
}
