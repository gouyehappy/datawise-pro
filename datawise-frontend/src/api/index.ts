/**
 * 应用层 API 统一入口。
 *
 * - UI / store / composable 只从此处 import，不直接引用 @/shared/api
 * - 按业务域拆分模块，便于维护与检索
 */
export {api, createApiClient, readApiBaseUrl, ApiError, HTTP_NOT_READY, API_PATHS} from '@/shared/api'
export type {HttpRequestOptions} from '@/shared/api'
export type {SystemMetricsSnapshot} from '@/shared/api/types'
export type {
    ApiClient,
    ApiResponse,
    AuthUser,
    ExecuteSqlResult,
    HealthSnapshot,
    HealthStatus,
    InstanceSqlFileItem,
    ReadInstanceSqlResult,
    SaveInstanceSqlPayload,
    SaveInstanceSqlResult,
    SqlExecuteOptions,
    WorkspaceSettings,
} from '@/shared/api'

export {explorerApi} from '@/api/modules/explorer'
export {instanceSqlApi} from '@/api/modules/instance-sql'
export {workspacePanelApi} from '@/api/modules/workspace-panel'
export {settingsApi} from '@/api/modules/settings'
export {sqlApi} from '@/api/modules/sql'
export {authApi} from '@/api/modules/auth'
export {tenantsApi} from '@/api/modules/tenants'
export {projectsApi} from '@/api/modules/projects'
export type {ProjectDto, ActiveProjectDto} from '@/api/modules/projects'
export {sharesApi} from '@/api/modules/shares'
export {userAdminApi} from '@/api/modules/user-admin'
export {aiApi} from '@/api/modules/ai'
export type {AiLlmProfilePayload, AiDatabaseTargetPayload} from '@/api/modules/ai'
export {
    syncAiPreferences,
    resolveWorkbenchAiLlmProfile,
    toAiDatabaseTargetPayload,
    toAiLlmProfilePayload,
    streamAiAnalysis,
    resumeAiAnalysis,
    logAiChatError,
    logAiChatRequest,
    logAiChatResponse,
} from '@/api/modules/ai'
export type {AiAnalysisStreamRequest, AiAnalysisStreamHandlers} from '@/api/modules/ai'
export {connectionApi} from '@/api/modules/connection'
export {tableDataApi} from '@/api/modules/table-data'
export {tableDetailApi} from '@/api/modules/table-detail'
export {datagenApi} from '@/api/modules/datagen'
export {migrationApi} from '@/api/modules/migration'
export {terminalApi} from '@/api/modules/terminal'
export {notificationsApi} from '@/api/modules/notifications'
export {pluginsApi} from '@/api/modules/plugins'
export {packsApi} from '@/api/modules/packs'
export {teamsApi} from '@/api/modules/teams'
export {configApi} from '@/api/modules/config'
export {datasourcesApi, runtimeApi} from '@/api/modules/datasources'
export {platformApi} from '@/api/modules/platform'
