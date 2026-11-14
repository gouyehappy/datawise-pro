# Frontend 性能 / 交互优化 Backlog

扫描范围：`datawise-frontend` 工作台（Vue 3 + Pinia + Vite，含桌面 JCEF 壳）。  
目标：按条目逐一落地，每项完成后把 **Status** 改为 `done`，并在 PR / 提交说明里引用条目 ID（如 `PERF-01`）。

**原则**

- 优先日常高频路径（SQL 控制台、AI 流式、启动首屏）。
- 不破坏已有好实践：树/网格虚拟化、终端 rAF 写合并、CEF visibility 保活、Vite `manualChunks`、Feature Contract 懒加载。
- 改 sticky / KeepAlive 时注意 CEF：`display:none` 会丢 iframe；会话型 Tab 禁止换挂载点。

**建议动手顺序**

1. `PERF-01` → `PERF-02` → `PERF-03`
2. `UX-01` → `PERF-04` → `PERF-05`
3. `PERF-12` → `PERF-13` → `PERF-14` → `PERF-15` → `PERF-16`
4. `PERF-17` → `PERF-18` → `PERF-19` → `PERF-20` → `PERF-21`
5. 其余按容量穿插；`AUDIT-*` 可与功能改动同 PR 顺带做

---

## Status 约定

| Status | 含义 |
|--------|------|
| `todo` | 未开始 |
| `doing` | 进行中 |
| `done` | 已合并 / 已验证 |
| `wontfix` | 明确不做（需写原因） |

---

## High

### PERF-01 · SQL 控制台 / 表详情切 Tab 重挂载

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 + 交互 |
| 主要路径 | `src/features/workspace/services/workspace-keepalive.policy.ts` |
| | `src/features/workspace/services/workspace-console-shell.policy.ts` |
| | `src/features/workspace/components/WorkspaceArea.vue`（`shouldShellPersist`） |
| | `src/features/workspace/components/tabs/SqlConsoleTab.vue` |
| 现状 | ~~`console` / `table` 不在 sticky~~ → `console` 已进 shell sticky；`table` 仍不缓存。 |
| 方案 | **已落地**：`console` 纳入 `WORKSPACE_SESSION_STICKY_TYPES` + `SqlConsoleTab` include；后台 console 受 `WORKSPACE_CONSOLE_SHELL_MAX`（8）LRU 限制（淘汰只拆壳不关 Tab）；激活时 `layout()`。表详情仍不 sticky。未做 Monaco `ICodeEditorViewState` 备选（壳保活已覆盖主路径）。 |
| 验收 | 打开两个 SQL 控制台，交替切换 ≥10 次：编辑器视图状态（光标/选区/滚动）保留；内存与 sticky 数量有上限，不无限堆积。 |
| 回归 | `workspace-keepalive-policy` + `workspace-console-shell.policy.spec.ts`。 |

### PERF-02 · AI 流式：逐 token patch + 全文 Markdown 重解析

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `src/features/ai/chat/composables/useAiChatSend.ts` |
| | `src/features/ai/chat/utils/ai-stream-patch-scheduler.ts` |
| | `src/features/ai/analysis/composables/useAnalysisStream.ts` |
| | `src/features/ai/stores/ai-chat.ts`（`patchMessage` / stream quiet persist） |
| | `src/features/ai/chat/components/AiMessageRow.vue` |
| | `src/features/ai/chat/services/ai-chat.service.ts`（`buildAssistantRenderBlocksCached`） |
| 现状 | ~~逐 token patch + 全文 markdown~~ → 已 coalesced。 |
| 方案 | **已落地**：1) rAF/40ms 批量 `patchMessage`；2) `beginStreamPersistQuiet` 流式期间跳过 persist / touch；3) 封闭 fence 密封、只重解析 tail；4) AiMessageRow 按角色/路径跳过无用 computed。虚拟列表仍属 PERF-05。 |
| 验收 | 长回复（数 KB+）流式过程中输入框 / 滚动仍可交互；结束态内容与现网一致；persist 不在每个 token 触发。 |

### PERF-03 · 启动：AppShell 静态拉 AI + Monaco 主题偏早

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能（首屏 / 首包） |
| 主要路径 | `src/app/AppShell.vue` / `ShortcutRail.vue` |
| | `src/core/code/register-code-editor-host.ts` |
| | `src/shared/config/monaco-editor-appearance.ts` |
| | idle warmup（`workbench-warmup.service.ts`） |
| 现状 | ~~AI 抽屉 / Monaco 主题进壳层关键路径~~ → 已拆开。 |
| 方案 | **已落地**：`AssistantDrawer` / `McpConfirmDrawer` / onboarding → `defineAsyncComponent`；`ensureMonacoThemes` 改为动态 import，壳层不再 sync 注册；idle warmup + `MonacoEditor` onBeforeMount 补齐。 |
| 验收 | 冷启动不打开 AI/编辑器时，网络/包分析中 AI 抽屉与 monaco 不在首屏必需链；首次打开 AI/SQL 仍正常。 |

---

## Medium

### UX-01 · 浮窗拖拽 / 缩放每帧写 Pinia

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 + 交互手感 |
| 主要路径 | `src/features/workspace/components/WorkspaceTabPane.vue`（`liveRect`） |
| | `src/features/dock/composables/usePanelHeaderDrag.ts` |
| | `src/features/dock/services/dock-float-live-preview.ts` |
| | `src/features/dock/components/FloatingPanelHost.vue` |
| 现状 | ~~`pointermove` 直接 patch Pinia~~ → 拖拽中本地预览，松手提交。 |
| 方案 | **已落地**：Tab 浮窗 `liveRect`；dock 用 `dock-float-live-preview` + resize 本地 ref；`pointerup` / Escape 再 `patchFloat`。保留 `is-dragging` CSS。 |
| 验收 | 拖多个浮窗时帧率明显更稳；松手后位置与 store 一致，刷新/持久化行为不变。 |

### PERF-04 · Kafka Topics 过滤无 debounce + 大列表 DOM

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 + 交互 |
| 主要路径 | `src/features/workspace/components/kafka/KafkaTopicsBrowser.vue` |
| | `src/features/explorer/services/kafka-topic-prefix.service.ts` |
| 现状 | ~~`localFilter` 即时过滤 + 全量 DOM~~ → 已对齐 Redis。 |
| 方案 | **已落地**：`useDebouncedRef(200ms)`；分组内 `KAFKA_TOPICS_VIRTUAL_PAGE=150` +「再显示剩余」展开（同 Redis Keys）。 |
| 验收 | 千级 topics 集群输入过滤不卡键；滚动/选中行为正确。 |

### PERF-05 · AI 消息列表未虚拟化

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `src/features/ai/chat/components/AiChatMessageList.vue` |
| | `src/features/ai/chat/services/ai-chat-message-window.ts` |
| 现状 | ~~全量 `v-for`~~ → 超阈值后只挂最近尾部。 |
| 方案 | **已落地**：可变高度消息不适合定高虚拟列表；`>48` 条时只挂最近 40 条，顶部「显示更早」按批展开并保持滚动锚点。完成的分析进度本就默认折叠（PERF-02 后路径）。 |
| 验收 | 百条+ 会话滚动流畅；跳底 / pin-to-bottom 行为保持。 |

### PERF-06 · 模块页离开即销毁

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 交互（感知性能） |
| 主要路径 | `src/features/layout/components/MainContent.vue` |
| | `src/features/layout/components/ModuleWorkbench.vue` |
| | `src/features/layout/services/module-page-keepalive.policy.ts` |
| 现状 | ~~离开即销毁~~ → KeepAlive max 2 保活最近模块页。 |
| 方案 | **已落地**：首次进入模块后宿主 `v-show` 保留；页 vnode 进 `KeepAlive`（`MODULE_PAGE_KEEPALIVE_MAX=2`）；`pageActive=false` 时卸 Terminal/Shortcut，避免与数据库壳双开。settings section 本就在 layout store。 |
| 验收 | 设置页搜索/滚动离开再回可恢复；内存不无限涨。 |

### PERF-07 · Settings 搜索每次按键同步索引

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `src/features/settings/SettingsView.vue` |
| | `src/core/utils/debounced-ref.ts`（`flushImmediately`） |
| 现状 | ~~每次按键同步索引~~ → 180ms debounce。 |
| 方案 | **已落地**：`useDebouncedRef(180)`；清空立即 flush；Enter 立即跑搜索；空态仅在 settled 时显示。 |
| 验收 | 连续输入不抖；结果与现逻辑一致。 |

### PERF-08 · WorkspaceArea 对 tabs deep watch

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `src/features/workspace/components/WorkspaceArea.vue` |
| | `src/features/workspace/services/workspace-docked-tab-sync.policy.ts` |
| 现状 | ~~deep watch tabs/floats~~ → 浅层 sync key。 |
| 方案 | **已落地**：`workspaceDockedTabSyncKey(activeTabId, tabIds, floatKeys)`，无 `deep`；title/SQL patch 不再触发 `syncLastDockedTab`。 |
| 验收 | 行为不变；SQL 执行/改 title 时该 watcher 不再深触发。 |

### PERF-09 · 图标注册表体积（Lucide + Phosphor）

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能（包体） |
| 主要路径 | `src/core/icons/registry.ts` |
| | `src/core/icons/registry-deferred.ts` |
| | `src/core/icons/phosphor.ts` |
| 现状 | ~~全量 Lucide 进首包；Phosphor 挂在主 barrel~~ → 壳层 + 延迟集。 |
| 方案 | **已落地（首切片）**：图表/设置/插件开发/schema-compare 等 ~15 个 Lucide 组件改 `ensureDeferredDwIcons` 动态加载；idle warmup + 入口页预取；Phosphor 改 `@/core/icons/phosphor` 子路径；删除未用 `Share2`。完整 Lucide→Phosphor 迁移仍可后续做。 |
| 验收 | 主 chunk / 首包体积下降可测；图标显示无回归。 |

### PERF-12 · Sticky 控制台 deep-watch sqlLogs

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `SqlConsoleTab.vue` / `sql-logs-recent-sync.policy.ts` |
| 现状 | ~~每个 sticky console deep watch sqlLogs~~ → 浅层 id key。 |
| 方案 | **已落地**：`sqlLogsRecentSyncKey(ids, connection, database)`；追加 log 才重建 recent queries。 |
| 验收 | 追加 sql log 时只触发一次重建；SQL 编辑不触发该路径。 |

### PERF-13 · Workspace session persist deep-watch tabs

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `app-config-store.ts` / `workspace-session-persist.policy.ts` |
| | `workspace.ts`（`sessionPersistTick`） |
| 现状 | ~~deep watch tabs~~ → 浅结构 key + sql tick。 |
| 方案 | **已落地**：结构 key（id/title/context/groups/floats）+ `updateTabSql` bump `sessionPersistTick`。 |
| 验收 | 键入 SQL 不再深遍历全部 tabs；关 Tab / 切 Tab / 改 title 仍会 persist。 |

### PERF-14 · WorkspaceTabs 误拉 QueryResultPane

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能（包体） |
| 主要路径 | `WorkspaceTabs.vue` |
| 现状 | ~~死 import QueryResultPane~~ → 已删除。 |
| 方案 | **已落地**：`WorkspaceTabIcon` 直引。 |
| 验收 | Tab 栏 chunk 不再包含 QueryResultPane / DataGrid。 |

### PERF-15 · Local Files 搜索无 debounce

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `local-files-store.ts` / `LocalFilesTree.vue` |
| 现状 | ~~名称过滤每键同步~~ → `debouncedSearchQuery` 180ms。 |
| 方案 | **已落地**：树 visibility/flatten 用 debounce；清空立即 flush；工具栏仍绑定 live query。 |
| 验收 | 连续输入不卡；结果与现逻辑一致。 |

### PERF-16 · QueryResultPane 次级面板同步 import

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能（包体） |
| 主要路径 | `QueryResultPane.vue` |
| 现状 | ~~Explain/DML/Diff/AI Summary 同步~~ → `defineAsyncComponent`。 |
| 方案 | **已落地**：对齐 ChartPanel 异步边界。 |
| 验收 | 首次出结果不必加载 explain/DML/diff/AI 包；打开对应视图仍正常。 |

### PERF-17 · Tab 栏 dirty 每键重算

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `workspace-chrome-signals.domain.ts` / `updateTabSql` |
| 现状 | ~~每键比较 sql~~ → `contentDirtyByTabId` 位图。 |
| 方案 | **已落地**：dirty 翻转才更新；restore 后批量 sync。 |
| 验收 | 连续键入 SQL 时 Tab 栏不随每键重绘；保存后圆点消失。 |

### PERF-18 · Sticky 控制台后台仍挂 QueryResultPane

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `WorkspaceTabPane.vue` / `SqlConsoleTab.vue` |
| 现状 | ~~隐藏壳仍挂结果区~~ → `pane-active` 门控。 |
| 方案 | **已落地**：后台卸 `QueryResultPane`；结果在 store，激活再挂。 |
| 验收 | 切走控制台后结果 DOM 卸下；切回数据仍在。 |

### PERF-19 · Local Markdown 预览每键同步

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `LocalTextTab.vue` |
| 现状 | ~~同步重算 preview~~ → 160ms debounce。 |
| 方案 | **已落地**：outline/html/assets 用 `debouncedPreviewContent`；后台 pane 跳过。 |
| 验收 | 大 MD 键入不卡；预览延迟可接受。 |

### PERF-20 · AI chat persist deep-watch

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `ai-chat.ts` |
| 现状 | ~~deep watch sessions~~ → 显式 `requestPersist`。 |
| 方案 | **已落地**：touch/create/delete + activeSessionId watch；流式 quiet 仍跳过。 |
| 验收 | 流式 quiet 行为不变；改名/删会话仍落盘。 |

### PERF-21 · Local 打开文件 2.5s 全量轮询

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `useLocalOpenFilesDiskWatch.ts` |
| 现状 | ~~固定全量 interval~~ → hidden 暂停 + 后台降频。 |
| 方案 | **已落地**：`document.hidden` 跳过；后台每 4 tick；激活优先；focus 全扫。 |
| 验收 | 隐藏窗口不轮询；多文件打开时 IPC 更少。 |

---

## Low / 审计

### AUDIT-01 · 剪贴板反馈渠道

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 交互 |
| 主要路径 | `src/features/workspace/components/VisualQueryBuilderDialog.vue` |
| 现状 | ~~弹窗内 copy 仍 toast~~ → Copy→Copied + 失败 `DwInlineAlert`。 |
| 方案 | **已落地**：审计后仅 VQB 违规；其余 GenerateDml / FakeData / GridCellDetail 等已合规。 |
| 说明 | 弹窗打开时禁止 toast（见 toast-usage 规则）。 |

### AUDIT-02 · 无障碍 / 焦点

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 交互 |
| 主要路径 | `NotificationDrawer` / `AssistantDrawer` / `ShortcutPanelDrawer` / `McpConfirmDrawer` |
| | `GlobalObjectSearchPalette.vue` |
| 现状 | ~~工具窗无 Escape；搜索列表无 listbox 宿主~~ → 已补齐。 |
| 方案 | **已落地（首切片）**：工具窗 `usePopoverEscape`；MCP `role=dialog`+`aria-modal`；全局搜索外层 `role=listbox`。未做 dock 抽屉 focus-trap 重做（CEF/布局风险）。 |
| 说明 | `AppModal` / `AppPalette` 本就有 focus trap。 |

### AUDIT-03 · 隐藏 shelled pane 绘制成本

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `src/features/workspace/components/WorkspaceTabPane.vue` |
| 现状 | ~~仅 visibility:hidden~~ → 后台壳加 `content-visibility: hidden` + `contain`。 |
| 方案 | **已落地**：`is-hidden` / 非前景 `is-main` 跳过绘制；前景恢复 `content-visibility: visible`。仍用 visibility，不用 `display:none`（CEF/会话 iframe）。 |
| 说明 | 多 sticky pane 时评估 `content-visibility` / `contain`；注意 CEF 与 visibility 策略，禁止改回 `display:none` 搞会话 iframe。 |

### PERF-10 · Kafka 消息列表（上限 ~50）

| 字段 | 内容 |
|------|------|
| Status | `wontfix` |
| 维度 | 性能 |
| 说明 | 当前 `KafkaMessagesPanel` fetch `limit: 50` 可接受；若提高上限再虚拟化。 |

### PERF-11 · 剩余 ECharts 静态消费方

| 字段 | 内容 |
|------|------|
| Status | `done` |
| 维度 | 性能 |
| 主要路径 | `src/shared/charts/EchartsPanel.vue` |
| 现状 | ~~担忧静态 echarts~~ → 运行时仅 `await import('echarts')`；其余为 `import type`。 |
| 方案 | **审计完成**：无额外静态运行时消费方需改。 |

---

## 已有好实践（改动时勿回退）

| 区域 | 做法 |
|------|------|
| 分包 | Vite `manualChunks`：monaco / echarts / exceljs / locales / pack-ai |
| Tab / 模块 | Feature Contract + `createLazyView` + idle warmup |
| Explorer | 树虚拟化（阈值 ~80）、搜索 debounce 200ms |
| Data grid | 分页 + 可选虚拟窗；XLSX 动态 import |
| SQL 次级 UI | AI/团队/可视化查询等 `defineAsyncComponent` |
| 终端 | 输出 rAF/timeout 合并；社区 SSH 写节流 |
| AI 滚动 | pin-to-bottom + rAF，不与用户上滚抢 |
| 持久化 | app config / AI chat 等 debounce |
| 桌面 | shell-first boot；CEF 用 visibility 保活；panel error boundary |
| 快捷键 / 遮罩 | `@datawise/shortcuts`；`AppModal` focus trap + Escape |
| 空态 | `DwPanelState` / `EmptyState` |
| 字体 | Latin 优先；Noto SC 按需 zh-CN |

---

## 进度速览

| ID | 标题 | Priority | Status |
|----|------|----------|--------|
| PERF-01 | SQL 控制台 sticky / viewState | High | `done` |
| PERF-02 | AI 流式 patch + markdown | High | `done` |
| PERF-03 | AppShell / Monaco 启动拆包 | High | `done` |
| UX-01 | 浮窗拖拽本地几何 | Medium | `done` |
| PERF-04 | Kafka Topics debounce + 虚拟化 | Medium | `done` |
| PERF-05 | AI 消息列表虚拟化 | Medium | `done` |
| PERF-06 | 模块页 KeepAlive / 滚动恢复 | Medium | `done` |
| PERF-07 | Settings 搜索 debounce | Medium | `done` |
| PERF-08 | WorkspaceArea 浅监听 | Medium | `done` |
| PERF-09 | 图标注册表拆分 | Medium | `done` |
| AUDIT-01 | 弹窗内复制反馈 | Low | `done` |
| AUDIT-02 | 抽屉/搜索 a11y | Low | `done` |
| AUDIT-03 | 隐藏 pane contain | Low | `done` |
| PERF-10 | Kafka 消息列表虚拟化（条件） | Low | `wontfix` |
| PERF-11 | ECharts 动态边界审计 | Low | `done` |
| PERF-12 | Sticky 控制台 sqlLogs 浅监听 | Medium | `done` |
| PERF-13 | Session persist 浅监听 | Medium | `done` |
| PERF-14 | WorkspaceTabs 去掉 QueryResultPane | Medium | `done` |
| PERF-15 | Local Files 搜索 debounce | Medium | `done` |
| PERF-16 | QueryResult 次级面板 async | Medium | `done` |
| PERF-17 | Tab 栏 dirty 位图 | Medium | `done` |
| PERF-18 | 隐藏 sticky 控制台卸结果区 | Medium | `done` |
| PERF-19 | Local MD 预览 debounce | Medium | `done` |
| PERF-20 | AI chat persist 浅触发 | Medium | `done` |
| PERF-21 | Local 文件磁盘轮询退避 | Medium | `done` |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-11-09 | 初稿：性能 + 交互扫描 backlog |
| 2026-11-09 | PERF-01 done：console shell sticky + LRU（`WORKSPACE_CONSOLE_SHELL_MAX`） |
| 2026-11-09 | PERF-02 done：AI stream patch coalesce + quiet persist + sealed markdown |
| 2026-11-09 | PERF-03 done：AppShell AI/onboarding async + deferred Monaco themes |
| 2026-11-09 | UX-01 done：tab/dock float drag live preview, commit on pointerup |
| 2026-11-09 | PERF-04 done：Kafka topics filter debounce + per-group virtual page |
| 2026-11-09 | PERF-05 done：AI chat message tail window + reveal earlier |
| 2026-11-09 | PERF-06 done：module page KeepAlive max 2 + pageActive chrome gate |
| 2026-11-09 | PERF-07 done：Settings search 180ms debounce + clear/Enter flush |
| 2026-11-09 | PERF-08 done：WorkspaceArea docked-tab sync shallow key |
| 2026-11-09 | PERF-09 done：deferred Lucide icons + Phosphor subpath |
| 2026-11-09 | AUDIT-01 done：VQB modal copy → Copied / DwInlineAlert |
| 2026-11-09 | AUDIT-02 done：tool-window Escape + palette listbox ARIA |
| 2026-11-09 | AUDIT-03 done：hidden shelled panes content-visibility + contain |
| 2026-11-09 | PERF-10 wontfix：Kafka messages cap 50 until raised |
| 2026-11-09 | PERF-11 done：ECharts already dynamic-import only |
| 2026-11-09 | residual scan：PERF-12..16 |
| 2026-11-09 | PERF-12 done：sqlLogs recent-sync shallow key |
| 2026-11-09 | PERF-13 done：session persist structure key + sql tick |
| 2026-11-09 | PERF-14 done：WorkspaceTabs drop QueryResultPane import |
| 2026-11-09 | PERF-15 done：Local Files tree search debounce |
| 2026-11-09 | PERF-16 done：QueryResult secondary panels async |
| 2026-11-09 | residual scan：PERF-17..21 |
| 2026-11-09 | PERF-17 done：contentDirtyByTabId for tab strip |
| 2026-11-09 | PERF-18 done：unmount QueryResultPane when pane inactive |
| 2026-11-09 | PERF-19 done：Local MD preview/outline 160ms debounce |
| 2026-11-09 | PERF-20 done：AI chat explicit requestPersist |
| 2026-11-09 | PERF-21 done：local disk watch hidden pause + bg backoff |
