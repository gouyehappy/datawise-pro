/**
 * SQL 选中文本浮层的全局单一状态源（刻意不用 Vue 响应式）。
 *
 * 为什么不用 reactive/ref：
 * - workspace 用 WorkspaceTabPane 的 visibility 常驻壳，所有 Tab 同时挂载；
 * - Monaco 选区变化若驱动浮层组件进入 Vue 的 patch 队列，就会和执行 SQL 后
 *   结果面板 / 编辑器 / 错误边界的更新交错，出现 insertBefore of null 竞态。
 *
 * 这里改为普通对象 + 命令式视图控制器：
 * - 浮层 DOM 由 AppShell 里的薄壳命令式创建挂到 body，Vue 组件渲染始终为空；
 * - show/hide 只写普通对象并调用 controller.apply（纯 DOM 写入，零组件渲染）；
 * - 动作以闭包注册，携带当时选中 SQL 的快照，点击时无需回读编辑器选区。
 */
export interface SqlSelectionToolbarActions {
  run: () => void
  explain: () => void
  format: () => void
}

export interface SqlSelectionToolbarShowPayload {
  selectedText: string
  x: number
  y: number
  explainSupported: boolean
}

export interface SqlSelectionToolbarViewState {
  visible: boolean
  x: number
  y: number
  explainSupported: boolean
}

export interface SqlSelectionToolbarController {
  apply(state: SqlSelectionToolbarViewState): void
}

const data: SqlSelectionToolbarViewState = {
  visible: false,
  x: 0,
  y: 0,
  explainSupported: false,
}

let controller: SqlSelectionToolbarController | null = null
/** 动作闭包由“当前展示浮层的那个 Tab”注册；Tab 失活 / 关闭时按 owner 清理。 */
let actions: SqlSelectionToolbarActions | null = null
let ownerTabId: string | null = null

export function registerToolbarController(next: SqlSelectionToolbarController): void {
  controller = next
  controller.apply({...data})
}

export function unregisterToolbarController(target: SqlSelectionToolbarController): void {
  if (controller === target) controller = null
}

/** 返回快照，避免调用方持有内部可变对象的引用。 */
export function getSqlSelectionToolbarState(): SqlSelectionToolbarViewState {
  return {...data}
}

function applyView(): void {
  controller?.apply({...data})
}

export function showSqlSelectionToolbar(
    tabId: string,
    payload: SqlSelectionToolbarShowPayload,
    nextActions: SqlSelectionToolbarActions,
): void {
  if (!payload.selectedText.trim()) {
    hideSqlSelectionToolbar(tabId)
    return
  }
  ownerTabId = tabId
  actions = nextActions
  data.x = payload.x
  data.y = payload.y
  data.explainSupported = payload.explainSupported
  data.visible = true
  applyView()
}

export function hideSqlSelectionToolbar(tabId?: string): void {
  if (tabId && ownerTabId !== tabId) return
  data.visible = false
  ownerTabId = null
  actions = null
  applyView()
}

export function runSqlSelectionToolbarAction(action: keyof SqlSelectionToolbarActions): void {
  if (!data.visible || !actions) return
  const target = actions
  // 先收起再执行：executeSql / formatSelection 会同步改编辑器与查询结果。
  data.visible = false
  ownerTabId = null
  actions = null
  applyView()
  target[action]()
}
