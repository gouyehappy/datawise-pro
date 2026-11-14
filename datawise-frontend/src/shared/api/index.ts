import {createApiClient} from '@/shared/api/create-client'

/** 全局 API 客户端（HTTP → Spring Boot 后端） */
export const api = createApiClient()

export {createApiClient, readApiBaseUrl} from '@/shared/api/create-client'
export {API_PATHS} from '@/shared/api/http/paths'
export {ApiError, HTTP_NOT_READY, buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'
export type {HttpRequestOptions} from '@/shared/api/http/request'
export {registerApiErrorNotifier} from '@/shared/api/http/api-error-notifier'
export {
    resolveApiErrorMessage,
    resolveCaughtApiErrorMessage,
    resolveCaughtMessage,
    looksLikeDeveloperEnglish,
    resolveDisplayApiErrorMessage,
} from '@/shared/api/http/api-error-message'
export type {
    AiApi,
    AiReplyContext,
    ApiClient,
    ApiResponse,
    AuthApi,
    AuthUser,
    AuthUserProfile,
    ConnectionApi,
    ConnectionTestResult,
    ExecuteSqlResult,
    ExplorerApi,
    ExplorerConnectionResult,
    ExplorerGroupResult,
    ExplorerImportResult,
    LoginResult,
    LlmTestResult,
    NotificationApi,
    PluginApi,
    SqlApi,
    SqlExecuteOptions,
    SystemApi,
    TableDataApi,
    TableDataResult,
    TeamApi,
    TerminalApi,
    TerminalExecResult,
    TerminalShellContext,
    WorkspaceApi,
    WorkspaceSettings,
    SaveInstanceSqlPayload,
    SaveInstanceSqlResult,
    ReadInstanceSqlPayload,
    ReadInstanceSqlResult,
    InstanceSqlFileItem,
    ListInstanceSqlScriptsPayload,
    RenameInstanceSqlPayload,
} from '@/shared/api/types'
export type {HealthSnapshot, HealthStatus} from '@/shared/api/http/system'
