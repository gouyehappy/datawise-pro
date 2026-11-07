# 偏好存储权威源

**原则：** 运行时只读专用 localStorage；`dw-app-config` / app.xml 内嵌字段作**导入导出信封**（与 SQL 编辑行为快捷层同构）。

| 偏好 | 运行时权威 key | 信封字段 | sync 行为 |
|------|----------------|----------|-----------|
| 主题 / 壳层（含 uiFont / uiFontCustom / uiTextScale / uiFontSizePx / uiDensity） | `dw-cli-theme-prefs`（桌面无后缀；Web 可用户 scope；桌面另镜像 `desktop-chrome.json`） | `theme` | 专用 key 为空才 hydrate |
| 编辑器 + 查询 | `dw-cli-editor-settings` | `editor` | 同上 |
| 语言 | `dw-cli-locale`（始终无后缀） | `locale` | 同上 |
| SQL 编辑行为层 | personal / shared 专用 key | `sqlEditorShortcuts*` | 同上；PUT 时从 summary 剥离 |
| 布局 / explorer / AI… | 进 app-config 本体或独立 JSON | — | 正常读写 |
| SSH 终端字号偏移 | `dw-cli-ssh-terminal-font-delta` | 无 | 本机工具偏好，不进迁移包 |
| Markdown TOC / 视图 | `dw-cli-local-text-md-toc` / `dw-cli-local-text-md-view` | 无 | 视图本地；旧 `dw.local-text.*` 读时迁移 |
| Explorer 注释等 | app-config `explorer.*` | 同左 | 设置 → 界面布局「资源树显示」与工具栏齿轮同步 |

### 仍保留的 migrate-once legacy（勿再写新代码依赖）

| Key / API | 处理 |
|-----------|------|
| `dw-layout-config` | `migrateLegacyStorageKeysOnce` → 写入 app-config 后删除 |
| local-files 旧 recent/favorite keys | 迁入 app-config 后 `clearLegacyLocalStoragePrefs` |
| `LEGACY_THEME_MAP` | 读编辑器设置时 remap 旧 Monaco 主题 id |
| `AiEmbeddingSettings.useChatConnection` | 强制 `false`；API 仍可读旧包 |
| MCP `permissionTier` | 仅 readonly；设置页为说明文案，非可选项 |

## 规则

1. **显式导入**（设置 → 布局备份 / 配置迁移叠加）可强制覆盖专用 key。
2. **服务端 sync / applyFullConfig** 不得用信封覆盖已有专用 key。
3. 导出快照仍从内存/专用 key **读出**写入信封，方便换机。
4. 新偏好：能独立成 key 的不要只塞进 app.xml 再双写；命名统一 `dw-cli-*`。
5. `DwIcon` 优先 `size="sm|md|lg|…"` 令牌；空态大图标可保留数字。其它图标组件（`AiIcon` / `PlusIcon` 等）各自 props，勿盲改。

## 相关实现

- `hydrateThemePreferencesFromEnvelope` — `theme-preferences-storage.ts`
- `hydrateEditorSettingsFromEnvelope` — `editor-settings-storage.ts`
- `hydrateLocaleFromEnvelope` — `i18n/index.ts`
- `hydrateSqlEditorStorageFromAppConfigBody` — `sql-editor-shortcuts.service.ts`
- `applyFullConfig` / `importConfigText` — `app-config-store.ts`
