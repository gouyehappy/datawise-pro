/**
 * 工作区 KeepAlive / 常驻壳策略。
 *
 * 历史问题：对表详情等异步 Tab 做 exclude 式缓存时，树节点连点会频繁 activate/prune，
 * Vue patch 偶发读到 null.nextSibling / subTree，触发整页 reload。
 *
 * 正确做法：只 include 必须保活的 Tab：
 * - 会话型（SSH / K8s Pods / Jenkins / Nacos / Polaris / Pod Exec）
 * - 未保存草稿型（连接表单 / 新建库），切走再回来不能丢填写内容
 * - 本地文本（local-text）：切 Tab 保留 Monaco/预览滚动位置，避免重挂载回到文件头
 * 表详情等仍不缓存。
 * Community workbench 不用 KeepAlive：iframe 在 CEF 下被 display:none 会丢画面，
 * 改由 WorkspaceArea 常驻层用 visibility 切换（对齐 DBX「保留 iframe」）。
 *
 * 小窗弹出：会话型 / 社区插件 / 当前主面 Tab 走同一 `WorkspaceTabPane` 壳，
 * 只改 mode（main|float|hidden），禁止换挂载点，避免 SSH/K8s 重连重载。
 */
import type {WorkspaceTabType} from '@/core/types'

export const WORKSPACE_KEEPALIVE_INCLUDE = [
    'SshTerminalTab',
    'K8sPodsTab',
    'K8sExecTab',
    'YarnWorkbenchTab',
    'JenkinsWorkbenchTab',
    'ConfigCenterWorkbenchTab',
    'ConnectionFormTab',
    'CreateDatabaseTab',
    'LocalTextTab',
] as const

/** 允许多个会话切 Tab 仍不断开；仅对这些 include 命中的 pane 生效。 */
export const WORKSPACE_KEEPALIVE_MAX = 14

/** Tab types that stay mounted in the workspace shell (mirrors KeepAlive include + community). */
export const WORKSPACE_SESSION_STICKY_TYPES: readonly WorkspaceTabType[] = [
    'community-workbench',
    'ssh-terminal',
    'k8s-pods',
    'k8s-exec',
    'yarn-applications',
    'yarn-nodes',
    'yarn-queues',
    'jenkins-jobs',
    'jenkins-nodes',
    'nacos-configs',
    'nacos-services',
    'polaris-services',
    'polaris-configs',
    'connection',
    'create-database',
    'local-text',
] as const

export function isWorkspaceSessionStickyType(type: WorkspaceTabType): boolean {
    return (WORKSPACE_SESSION_STICKY_TYPES as readonly string[]).includes(type)
}
