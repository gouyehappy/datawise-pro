/** 用户资源域：菜单/配置/数据源/AI/用户产出数据，统一由 policy 裁决读写与隔离范围。 */
export const UserResource = {
    /** 布局与侧栏菜单可见性（app-config.layout） */
    LayoutMenu: 'layout.menu',
    /** 应用偏好（app-config 主体） */
    AppConfig: 'app.config',
    /** AI LLM 配置（app-config.ai） */
    AiPreferences: 'ai.preferences',
    /** AI 业务词条（服务端 users/{id}/ai-knowledge.json） */
    AiKnowledge: 'ai.knowledge',
    /** AI 对话历史（localStorage） */
    AiChat: 'ai.chat',
    /** AI 分析模板（localStorage） */
    AiAnalysisTemplates: 'ai.analysis-templates',
    /** 数据质量规则模板（localStorage） */
    DataQualityTemplates: 'platform.data-quality-templates',
    /** Explorer 连接/目录（访客会话 catalog / 注册用户 connections.xml） */
    ConnectionCatalog: 'connection.catalog',
    /** 工作区 SQL 脚本（workspace 目录） */
    WorkspaceScripts: 'workspace.scripts',
    /** SQL 历史、收藏控制台、导出任务等用户产出 */
    WorkspaceUserData: 'workspace.user-data',
    /** 个人 SQL snippets */
    SqlSnippetsPersonal: 'sql.snippets.personal',
    /** 团队 SQL snippets（全局 shared） */
    SqlSnippetsShared: 'sql.snippets.shared',
    /** 表迁移历史 */
    MigrationHistory: 'explorer.migration-history',
    /** 固定 Explorer 节点 */
    PinnedExplorerNodes: 'explorer.pinned-nodes',
    /** 表格视图状态 */
    GridViewState: 'workspace.grid-view-state',
    /** 编辑器偏好 */
    EditorPreferences: 'editor.preferences',
    /** 主题偏好 */
    ThemePreferences: 'theme.preferences',
    /** 更新器偏好（全局） */
    UpdatePreferences: 'updater.preferences',
} as const

export type UserResourceType = (typeof UserResource)[keyof typeof UserResource]

export type StorageScope = 'none' | 'session' | 'user' | 'global'

export interface UserResourceRule {
    /** 本地 localStorage 隔离范围 */
    localScope: StorageScope
    /** 服务端持久化范围 */
    serverScope: StorageScope
    /** 访客是否可读（会话内） */
    guestRead: boolean
    /** 访客是否可写（会话内临时） */
    guestWrite: boolean
}
