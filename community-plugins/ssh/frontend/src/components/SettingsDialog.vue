<script setup lang="ts">
// 设置弹窗（从 App.vue 抽出的独立组件）：承载设置主弹窗与 quick sudo 配置档
// 管理弹窗，两者共用同一份 sudoProfiles/profileDraft 草稿状态。连接级设置
// （ssh/settings/get|set）、配置档（sudo/profiles/*）、已知主机
// （ssh/knownHosts/*）、本机密钥发现（keys/discover）、MCP 限速
// （mcp/settings/*）经全局 window.datawisePlugin.invoke 直调；下载偏好与终端偏好
// （WebGL/选中复制/终端字体）的权威态在宿主 App——下载偏好经 downloadPrefs
// 适配器读写，终端偏好经 props 下发 + emits 上抛。
import { computed, nextTick, reactive, ref, watch, type Component } from "vue";
import { ArrowDown, ArrowLeft, ArrowUp, Bot, Check, Download, Eye, EyeOff, FileUp, FolderOpen, KeyRound, Loader2, Network, Pencil, Plus, RotateCcw, Search, Shield, ShieldCheck, SquareTerminal, Trash2, X, Zap } from "@lucide/vue";
import type { TerminalSplitOrientation } from "../lib/terminalSplit";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Switch } from "./ui/switch";
import TerminalSchemePicker from "./TerminalSchemePicker.vue";
import TerminalPreviewCard from "./TerminalPreviewCard.vue";
import QuickCommandEditorDialog from "./QuickCommandEditorDialog.vue";
import SettingsManageModal from "./SettingsManageModal.vue";
import { AGENT_MODES, sanitizeRememberedCommands } from "../lib/agentTerminal";
import { clampFontSize, TERMINAL_FONT_MAX, TERMINAL_FONT_MIN } from "../lib/terminalZoom";
import { loadTerminalFontOverride } from "../lib/terminalFont";
import { MIB, mibField, settingsErrorOf, type DiscoveredKey, type KnownHostEntry, type McpSizeSettings, type SshSettings, type SudoProfileView } from "../lib/settingsModel";
import { DOWNLOAD_CONFLICT_POLICIES, COMPRESSION_STRATEGIES, type CompressionStrategy, type DownloadConflictPolicy } from "../lib/downloadPrefs";
import {
  ACCEPT_SUGGESTION_KEYS,
  COMPLETION_MODES,
  NOWRAP_COLUMNS_MAX,
  NOWRAP_COLUMNS_MIN,
  type AcceptSuggestionKey,
  type CompletionMode,
  type InteractionPrefs,
} from "../lib/interactionPrefs";
import {
  HIGHLIGHT_COLOR_DEFAULT,
  HIGHLIGHT_RULES_LIMIT,
  normalizeHighlightRules,
  sanitizeHighlightRuleInput,
  type HighlightRuleView,
} from "../lib/keywordHighlight";
import { type SftpColumn } from "../lib/sftpEntries";
import { QUICK_COMMANDS_LIMIT, canAddQuickCommandInScope, type QuickCommand } from "../lib/quickCommands";
import {
  canAddStartupCommand,
  emptyStartupBucket,
  mergeStartupStore,
  sanitizeStartupBucket,
  STARTUP_COMMANDS_LIMIT,
  STARTUP_DELAY_DEFAULT_MS,
  type StartupCommandsBucket,
} from "../lib/startupCommands";
import {
  type EditorAssociation,
  type EditorConfig,
  type KnownEditor,
} from "../lib/editorRules";
import {
  DEFAULT_TERMINAL_APPEARANCE_SETTINGS,
  FONT_FALLBACK_LIMIT,
  findScheme,
  sanitizeAppearanceSettings,
  sanitizeFontFallbacks,
  TERMINAL_APPEARANCE_PRESETS,
  type TerminalAppearanceProfile,
  type TerminalAppearanceState,
  type TerminalCursorThickness,
  type TerminalIntenseMode,
} from "../lib/terminalAppearance";
import {
  DEFAULT_WORD_SEPARATORS,
  FIND_ORIGIN_CHOICES,
  SCROLLBACK_CHOICES,
  type Osc52ClipboardPolicy,
  type TabTitleMode,
  type TerminalFindOrigin,
  type TerminalScrollbackLines,
  type TerminalSessionPrefs,
} from "../lib/terminalSessionPrefs";
import {
  AUTOFILL_NAME_MAX,
  AUTOFILL_PATTERN_MAX,
  AUTOFILL_RULES_LIMIT,
  AUTOFILL_TEXT_MAX,
  sanitizeAutofillRuleInput,
  type AutofillRule,
} from "../lib/autofillRules";
import {
  DEFAULT_RIGHT_TOOL_RAIL_PREFS,
  moveRailItem,
  rightRailItemLabelKey,
  toggleRailItemHidden,
  type RightRailItemId,
  type RightToolRailPrefs,
} from "../lib/rightToolRailPrefs";
import {
  type TerminalBgImagePrefs,
  type TerminalBgStrength,
} from "../lib/terminalBgImage";
import {
  ANSI_COLOR_NAMES,
  ensureBuiltinSchemeCatalog,
  getBuiltinTerminalSchemes,
  normalizeHexColor,
  parseSchemeImport,
  schemeIdFromName,
  uniqueSchemeId,
  type TerminalColorScheme,
} from "../lib/terminalScheme";
import { CUSTOM_SCHEME_LIMIT, sanitizeCustomScheme } from "../lib/terminalAppearance";
import {
  parseSshConfigExport,
  parseSshConfigImport,
  parseSshConfigRead,
  settingsErrorOf as sshConfigErrorOf,
  sshConfigHostDrafts,
  type SshConfigReadResult,
} from "../lib/sshConfigSync";
import { createHostConnectionsFromImport } from "../lib/connectionImport";
import type { CopilotChatMode } from "../lib/copilot/types";
import type { CopilotReplyLanguage } from "@datawise/community-copilot-kit";

const QUICK_PRESET_IDS = ["preset-dracula", "preset-nord", "preset-tokyo-night", "preset-gruvbox", "preset-host"] as const;

const COPILOT_MODEL_LIMIT = 12;

const props = defineProps<{
  open: boolean;
  profilesOpen: boolean;
  /** Jump to a settings category when the dialog opens (e.g. dock → agent). */
  focusCategory?: "sudo" | "agent" | "transfer" | "terminal" | "security" | "mcp" | null;
  /** Optional card anchor inside the focused category (e.g. quick-commands, resource-startup). */
  focusAnchor?: string | null;
  /** Visible quick command count for the settings card. */
  quickCommandCount?: number;
  /** Quick command list, used by the add form opened from the settings card. */
  quickCommands?: QuickCommand[];
  /** True while a quick command save is in flight. */
  quickSaving?: boolean;
  /** When true with focusCategory agent, open the add-model form. */
  focusAddModel?: boolean;
  sessionId?: string;
  /** Active connection id for per-connection startup commands. */
  connectionId?: string;
  /** Current connection metadata (no secrets) — fallback for SSH config export. */
  connection?: { name?: string; host?: string; port?: number; username?: string };
  /** 终端当前生效字号（缩放链路在 App，设置页字号草稿以它为初始回显）。 */
  terminalFontSize: number;
  /** 宿主主题终端基准字号（「恢复默认」回到该值）。 */
  hostFontSize: number;
  /** Host light/dark — picks which scheme slot is live. */
  hostColorScheme: "light" | "dark";
  localDownloadDir: string;
  localCanSave: boolean;
  webglEnabled: boolean;
  termSelectCopy: boolean;
  termClickCursor: boolean;
  /** 会话顶栏常驻 CPU/MEM/DISK/NET 资源条。 */
  resourceStripEnabled: boolean;
  /** New workbenches open with the SFTP dock visible. */
  sftpPaneDefaultOpen: boolean;
  /** Motty-style right tool rail visibility (global habit). */
  rightRailOpen: boolean;
  /** X-TOOLBAR: icon order + hidden set. */
  rightToolRailPrefs: RightToolRailPrefs;
  /** X-BGIMG: terminal backdrop image. */
  terminalBgImage: TerminalBgImagePrefs;
  /** X-CATALOG: curated Fig extras status line. */
  figCatalogStatus: string;
  figCatalogBusy: boolean;
  figCatalogMessage: string;
  figCatalogHasOverlay: boolean;
  /** Default in-pane split orientation (left/right vs stacked). */
  splitOrientation: TerminalSplitOrientation;
  /** Persist sync-input default for the next split session. */
  syncInputEnabled: boolean;
  /** SFTP cwd follows terminal OSC 7 / shell integration. */
  followDirectory: boolean;
  followDirectoryDisabled?: boolean;
  /** Visible SFTP list columns. */
  visibleColumns: SftpColumn[];
  /** Keyword highlight master switch (rules live in sidecar). */
  highlightEnabled: boolean;
  /** Shared highlight rules (App hydrates + renders; settings only edits). */
  highlightRules: HighlightRuleView[];
  /** Default open state for the session copilot dock. */
  copilotDockDefaultOpen: boolean;
  /** Ask = explain only; Agent = propose/run cards. */
  copilotChatMode: CopilotChatMode;
  /** auto = follow UI locale; zh-CN / en = force reply language. */
  copilotReplyLanguage: CopilotReplyLanguage;
  /** Mask secrets in terminal output / tool results before they enter the LLM prompt. */
  copilotRedactOutput: boolean;
  interactionPrefs: InteractionPrefs;
  /** Motty-parity OSC 52 / scrollback / find / bell / close confirms. */
  sessionPrefs: TerminalSessionPrefs;
  /** Motty autofill rules (fixed-text; confirm-before-send in App). */
  autofillRules: AutofillRule[];
  /** 下载偏好的读写适配器（权威态与 sidecar preferences 同步在 App）。 */
  downloadPrefs: {
    loadDir(): string;
    loadUseDefault(): boolean;
    loadConflict(): DownloadConflictPolicy;
    persistDir(value: string): void;
    persistUseDefault(value: boolean): void;
    persistConflict(value: DownloadConflictPolicy): void;
    loadCompression(): CompressionStrategy;
    loadCompressionThreshold(): number;
    persistCompression(strategy: CompressionStrategy, thresholdMib: number): void;
  };
  editorPrefs: {
    loadConfig(): EditorConfig;
    persistConfig(value: EditorConfig): void;
    loadEditors(): KnownEditor[];
    reloadEditors(): Promise<KnownEditor[]>;
  };
  terminalAppearance: TerminalAppearanceState;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "update:profilesOpen", value: boolean): void;
  (e: "notice", message: string): void;
  (e: "error", cause: unknown): void;
  (e: "browse-download-dir"): void;
  (e: "update:webgl", value: boolean): void;
  (e: "toggle-select-copy"): void;
  (e: "toggle-click-cursor"): void;
  (e: "update:resourceStrip", value: boolean): void;
  (e: "update:sftpPaneDefaultOpen", value: boolean): void;
  (e: "update:rightRailOpen", value: boolean): void;
  (e: "update:rightToolRailPrefs", value: RightToolRailPrefs): void;
  (e: "update:terminalBgImage", value: TerminalBgImagePrefs): void;
  (e: "choose-terminal-bg-image", file: File): void;
  (e: "clear-terminal-bg-image"): void;
  (e: "check-fig-catalog"): void;
  (e: "clear-fig-catalog"): void;
  (e: "update:splitOrientation", value: TerminalSplitOrientation): void;
  (e: "update:syncInputEnabled", value: boolean): void;
  (e: "update:followDirectory", value: boolean): void;
  (e: "toggle-column", column: SftpColumn): void;
  (e: "update:highlightEnabled", value: boolean): void;
  (e: "highlight-rules-changed", rules: HighlightRuleView[]): void;
  (e: "quick-command-save", payload: { id?: string; name: string; command: string; group: string; scope: "global" | "connection" }): void;
  (e: "update:copilotDockDefaultOpen", value: boolean): void;
  (e: "update:copilotChatMode", value: CopilotChatMode): void;
  (e: "update:copilotReplyLanguage", value: CopilotReplyLanguage): void;
  (e: "update:copilotRedactOutput", value: boolean): void;
  (e: "update:interactionPrefs", value: Partial<InteractionPrefs>): void;
  (e: "update:sessionPrefs", value: Partial<TerminalSessionPrefs>): void;
  (e: "update:autofillRules", value: AutofillRule[]): void;
  (e: "copilot-llm-saved"): void;
  (e: "apply-font", payload: { family: string | null; size: number }): void;
  (e: "update:terminalAppearance", value: TerminalAppearanceState): void;
}>();

const fontFallbackDraft = ref("");

function patchSessionPrefs(patch: Partial<TerminalSessionPrefs>) {
  emit("update:sessionPrefs", patch);
}

function patchRightToolRailPrefs(patch: Partial<RightToolRailPrefs>) {
  emit("update:rightToolRailPrefs", {
    order: patch.order ?? props.rightToolRailPrefs.order,
    hidden: patch.hidden ?? props.rightToolRailPrefs.hidden,
  });
}

function moveRightRailItem(id: RightRailItemId, delta: -1 | 1) {
  patchRightToolRailPrefs({ order: moveRailItem(props.rightToolRailPrefs.order, id, delta) });
}

function toggleRightRailHidden(id: RightRailItemId) {
  patchRightToolRailPrefs({ hidden: toggleRailItemHidden(props.rightToolRailPrefs.hidden, id) });
}

function resetRightToolRailPrefs() {
  emit("update:rightToolRailPrefs", {
    order: [...DEFAULT_RIGHT_TOOL_RAIL_PREFS.order],
    hidden: [],
  });
}

function onTerminalBgFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) emit("choose-terminal-bg-image", file);
}

function patchTerminalBgStrength(strength: TerminalBgStrength) {
  emit("update:terminalBgImage", { ...props.terminalBgImage, strength });
}

function addFontFallback() {
  const next = sanitizeFontFallbacks([...props.terminalAppearance.settings.fontFallbacks, fontFallbackDraft.value]);
  fontFallbackDraft.value = "";
  patchTerminalAppearance({ fontFallbacks: next });
}

function removeFontFallback(index: number) {
  const next = props.terminalAppearance.settings.fontFallbacks.filter((_, i) => i !== index);
  patchTerminalAppearance({ fontFallbacks: next });
}

const t = props.t;

/** Motty-ordered categories: Terminal → Connection → Files → Assistant → Security → MCP. */
const SETTINGS_CATEGORIES: ReadonlyArray<{
  id: "sudo" | "agent" | "transfer" | "terminal" | "security" | "mcp";
  labelKey: string;
  blurbKey: string;
  icon: Component;
}> = [
  { id: "terminal", labelKey: "settingsNav.terminal", blurbKey: "settingsNav.terminalBlurb", icon: SquareTerminal },
  { id: "sudo", labelKey: "settingsNav.connection", blurbKey: "settingsNav.connectionBlurb", icon: Network },
  { id: "transfer", labelKey: "settingsNav.files", blurbKey: "settingsNav.filesBlurb", icon: FolderOpen },
  { id: "agent", labelKey: "settingsNav.assistant", blurbKey: "settingsNav.assistantBlurb", icon: Bot },
  { id: "security", labelKey: "settingsNav.security", blurbKey: "settingsNav.securityBlurb", icon: Shield },
  { id: "mcp", labelKey: "settingsNav.mcp", blurbKey: "settingsNav.mcpBlurb", icon: ShieldCheck },
];
type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number]["id"];
/** Each reusable setting has its own manage dialog, mirroring the keyword-highlight rule manager. */
type ManageTarget = "quick" | "startup" | "models" | "highlight" | "autofill" | "rail";
const settingsCategory = ref<SettingsCategory>("terminal");
const activeCategory = computed(() => SETTINGS_CATEGORIES.find((cat) => cat.id === settingsCategory.value) ?? SETTINGS_CATEGORIES[0]!);
const schemeBrowserOpen = ref(false);
const settingsSearch = ref("");
const settingsContentEl = ref<HTMLElement | null>(null);
const settingsSearchInputEl = ref<HTMLInputElement | null>(null);

/** Motty settings_search.go: every setting is findable by name/hint/alias, then jump-scrolls to its card. */
type SettingsSearchEntry = {
  category: SettingsCategory;
  labelKey: string;
  hintKey?: string;
  anchor: string;
  aliases?: string;
  /** Open this resource's manage dialog instead of scrolling to a card. */
  manage?: ManageTarget;
};

const SETTINGS_SEARCH_INDEX: readonly SettingsSearchEntry[] = [
  { category: "terminal", labelKey: "terminalAppearance.schemeSection", hintKey: "terminalAppearance.schemeHint", anchor: "scheme", aliases: "theme color scheme 配色" },
  { category: "terminal", labelKey: "webglLabel", hintKey: "webglHint", anchor: "webgl", aliases: "gpu render 渲染" },
  { category: "terminal", labelKey: "terminalLayout.section", hintKey: "terminalLayout.hint", anchor: "layout", aliases: "split sync sftp rail 分屏 布局" },
  { category: "terminal", labelKey: "followTerminal", hintKey: "followTerminalHint", anchor: "follow", aliases: "cwd directory 跟随目录" },
  { category: "terminal", labelKey: "highlightRules.title", hintKey: "highlightRules.settingsHint", anchor: "highlight", aliases: "keyword ERROR WARN 高亮", manage: "highlight" },
  { category: "terminal", labelKey: "interactionPrefs.section", anchor: "interaction", aliases: "copy click history suggest 交互" },
  { category: "terminal", labelKey: "interactionPrefs.commandHints", hintKey: "interactionPrefs.commandHintsHint", anchor: "command-hints", aliases: "argument hint parameter lint risk remote help 参数 提示 语法 风险 远端帮助" },
  { category: "terminal", labelKey: "figCatalog.title", hintKey: "figCatalog.hint", anchor: "fig-catalog", aliases: "fig catalog completion update 命令库 补全 更新" },
  { category: "terminal", labelKey: "sessionPrefs.section", hintKey: "sessionPrefs.sectionHint", anchor: "session-prefs", aliases: "osc52 clipboard scrollback word separator latency bell notify password hint 剪贴板 回滚 通知 密码" },
  { category: "terminal", labelKey: "sessionPrefs.passwordHint", hintKey: "sessionPrefs.passwordHintHint", anchor: "session-prefs", aliases: "password sudo vault hint 密码 提示" },
  { category: "terminal", labelKey: "sessionPrefs.pasteImage", hintKey: "sessionPrefs.pasteImageHint", anchor: "session-prefs", aliases: "paste image png screenshot 粘贴 图片" },
  { category: "terminal", labelKey: "sessionPrefs.gutter", hintKey: "sessionPrefs.gutterHint", anchor: "session-prefs", aliases: "gutter line number time 行号 时间" },
  { category: "terminal", labelKey: "sessionPrefs.findSection", hintKey: "sessionPrefs.findHint", anchor: "find-prefs", aliases: "find search highlight origin 查找 高亮 起点" },
  { category: "terminal", labelKey: "autofillRules.title", hintKey: "autofillRules.settingsHint", anchor: "autofill", aliases: "autofill regex reply 自动填充", manage: "autofill" },
  { category: "terminal", labelKey: "startupCommands.title", anchor: "startup", aliases: "boot commands 启动命令", manage: "startup" },
  { category: "terminal", labelKey: "quickCommands", hintKey: "quickCommands.settingsHint", anchor: "quick-commands", aliases: "snippet quick command 快捷命令", manage: "quick" },
  { category: "agent", labelKey: "copilot.settingsModels", hintKey: "copilot.modelsManageHint", anchor: "copilot-models", aliases: "llm model provider 模型", manage: "models" },
  { category: "terminal", labelKey: "terminalFont.title", anchor: "font", aliases: "font size family 字体" },
  { category: "terminal", labelKey: "terminalDisplay.section", hintKey: "terminalDisplay.hint", anchor: "display", aliases: "cursor lineHeight padding 光标" },
  { category: "sudo", labelKey: "settingsQuickSudo", anchor: "sudo", aliases: "sudo password totp 提权" },
  { category: "sudo", labelKey: "profilesTitle", anchor: "profiles", aliases: "quick sudo profile 配置档" },
  { category: "sudo", labelKey: "x11Forwarding.label", hintKey: "x11Forwarding.settingsHint", anchor: "x11", aliases: "x11 forwarding" },
  { category: "transfer", labelKey: "customizeColumns", hintKey: "customizeColumnsHint", anchor: "columns", aliases: "sftp columns 表头" },
  { category: "transfer", labelKey: "downloadSettings.title", anchor: "download", aliases: "download folder 下载" },
  { category: "transfer", labelKey: "downloadSettings.conflictTitle", anchor: "conflict", aliases: "overwrite rename 重名" },
  { category: "transfer", labelKey: "downloadSettings.compressionTitle", anchor: "compression", aliases: "gzip lzpack 压缩" },
  { category: "transfer", labelKey: "sftpEdit.settingsSection", anchor: "editor", aliases: "external editor 编辑器" },
  { category: "agent", labelKey: "agentTerminalMode", hintKey: "agentTerminalQuickHint", anchor: "agent-mode", aliases: "mcp approval agent 审批" },
  { category: "agent", labelKey: "settingsRemembered.section", anchor: "remembered", aliases: "remembered commands 记住" },
  { category: "agent", labelKey: "copilot.settingsTitle", hintKey: "copilot.settingsHint", anchor: "copilot", aliases: "llm model dock 助手" },
  { category: "security", labelKey: "knownHosts.title", anchor: "known-hosts", aliases: "fingerprint host key 已知主机" },
  { category: "security", labelKey: "keysPanel.title", hintKey: "keysPanel.hint", anchor: "keys", aliases: "private key 密钥" },
  { category: "mcp", labelKey: "settingsNav.mcp", hintKey: "settingsNav.mcpBlurb", anchor: "mcp", aliases: "limits permission scope" },
  // Motty settings_search.go: field-level entries so single controls (not just cards) are findable.
  { category: "terminal", labelKey: "terminalDisplay.cursorStyle", anchor: "display-cursor", aliases: "caret block bar underline 光标 形状" },
  { category: "terminal", labelKey: "terminalDisplay.cursorBlink", anchor: "display-cursor", aliases: "blink 闪烁" },
  { category: "terminal", labelKey: "terminalDisplay.cursorThickness", anchor: "display-cursor", aliases: "thickness thin thick 粗细" },
  { category: "terminal", labelKey: "terminalDisplay.intense", anchor: "display-intense", aliases: "bold bright intense 粗体 亮色" },
  { category: "terminal", labelKey: "terminalDisplay.lineHeight", anchor: "display-line-height", aliases: "spacing density 行距 行高" },
  { category: "terminal", labelKey: "terminalDisplay.letterSpacing", anchor: "display-letter-spacing", aliases: "tracking 字间距" },
  { category: "terminal", labelKey: "terminalDisplay.padding", anchor: "display-padding", aliases: "inset gutter 内边距" },
  { category: "terminal", labelKey: "terminalDisplay.contrast", anchor: "display-contrast", aliases: "a11y readability 对比度" },
  { category: "terminal", labelKey: "terminalFont.family", anchor: "font", aliases: "typeface monospace 字体族" },
  { category: "terminal", labelKey: "terminalFont.fallbacks", anchor: "font", aliases: "fallback CJK 备用字体" },
  { category: "terminal", labelKey: "terminalFont.size", anchor: "font", aliases: "zoom px 字号" },
  { category: "terminal", labelKey: "terminalFont.weight", anchor: "font-weight", aliases: "weight bold regular 字重 粗细" },
  { category: "terminal", labelKey: "terminalFont.weightBold", anchor: "font-weight-bold", aliases: "bold weight SGR 粗体字重" },
  { category: "terminal", labelKey: "sessionPrefs.osc52", anchor: "session-prefs", aliases: "clipboard osc 52 剪贴板" },
  { category: "terminal", labelKey: "sessionPrefs.scrollback", anchor: "session-prefs", aliases: "history buffer 回滚" },
  { category: "terminal", labelKey: "sessionPrefs.wordSeparators", anchor: "session-prefs", aliases: "double click word 选词" },
  { category: "terminal", labelKey: "sessionPrefs.tabTitle", anchor: "session-prefs", aliases: "title cwd path 标签" },
  { category: "terminal", labelKey: "sessionPrefs.showLatency", anchor: "session-prefs", aliases: "rtt ping 延迟" },
  { category: "terminal", labelKey: "sessionPrefs.bell", anchor: "session-prefs", aliases: "bel sound 响铃" },
  { category: "terminal", labelKey: "sessionPrefs.notifications", anchor: "session-prefs", aliases: "osc9 notify toast 通知" },
  { category: "terminal", labelKey: "sessionPrefs.closeSessionConfirm", anchor: "session-prefs", aliases: "disconnect confirm 断开" },
  { category: "terminal", labelKey: "terminalPreview.section", hintKey: "terminalPreview.hint", anchor: "preview", aliases: "live sample 实时预览 示例" },
  { category: "terminal", labelKey: "interactionPrefs.historyLimit", anchor: "interaction", aliases: "history 历史 条数" },
  { category: "terminal", labelKey: "interactionPrefs.completionMode", hintKey: "interactionPrefs.completionModeHint", anchor: "completion-mode", aliases: "inline completion hotkey list 行内 建议 补全" },
  { category: "terminal", labelKey: "interactionPrefs.acceptKeyHint", hintKey: "interactionPrefs.acceptKeyHintHint", anchor: "completion-mode", aliases: "accept hint key → Tab 按键提示" },
  { category: "terminal", labelKey: "interactionPrefs.acceptSuggestionKey", anchor: "completion-mode", aliases: "accept suggestion Tab Shift arrow 接受 建议 按键" },
  { category: "terminal", labelKey: "interactionPrefs.noWrap", anchor: "interaction", aliases: "wrap nowrap scroll 换行 日志 JSON" },
  { category: "terminal", labelKey: "terminalSplit.syncDefault", anchor: "layout", aliases: "broadcast typing 同步输入" },
  { category: "terminal", labelKey: "resourceStrip.label", anchor: "layout", aliases: "cpu mem disk net 资源 状态条" },
  { category: "terminal", labelKey: "rightRail.label", anchor: "layout", aliases: "tool rail 右侧 工具栏" },
  { category: "terminal", labelKey: "rightRail.customize", hintKey: "rightRail.customizeHint", anchor: "rail-items", aliases: "toolbar order hide 工具栏 排序 隐藏", manage: "rail" },
  { category: "terminal", labelKey: "terminalBgImage.section", hintKey: "terminalBgImage.hint", anchor: "bg-image", aliases: "background wallpaper image 背景 壁纸" },
  { category: "sudo", labelKey: "settingsSudoPassword", anchor: "sudo", aliases: "sudo password 提权 密码" },
  { category: "sudo", labelKey: "settingsTotp", anchor: "sudo", aliases: "2fa otp mfa 验证码" },
  { category: "sudo", labelKey: "settingsFlowMode", anchor: "sudo", aliases: "auth flow 认证流" },
  { category: "sudo", labelKey: "sshSync.title", hintKey: "sshSync.hint", anchor: "ssh-config-sync", aliases: "ssh config sync openssh 同步 配置" },
  { category: "transfer", labelKey: "downloadSettings.directory", anchor: "download", aliases: "path folder 目录" },
  { category: "transfer", labelKey: "sftpEdit.defaultEditorTitle", anchor: "editor", aliases: "editor association 打开方式" },
  { category: "agent", labelKey: "copilot.chatMode", anchor: "copilot", aliases: "ask agent 模式" },
  { category: "agent", labelKey: "copilot.replyLanguage", anchor: "copilot", aliases: "language 中文 英文 回复" },
  { category: "agent", labelKey: "copilot.redactOutput", hintKey: "copilot.redactOutputHint", anchor: "copilot", aliases: "secret token password mask privacy 脱敏 密钥 隐私" },
];

const settingsSearching = computed(() => settingsSearch.value.trim().length > 0);
const settingsSearchResults = computed(() => {
  const raw = settingsSearch.value.trim().toLowerCase();
  if (!raw) return [] as SettingsSearchEntry[];
  const terms = raw.split(/\s+/).filter(Boolean);
  return SETTINGS_SEARCH_INDEX.filter((entry) => {
    const categoryLabel = t(SETTINGS_CATEGORIES.find((cat) => cat.id === entry.category)?.labelKey ?? "");
    const haystack = [
      t(entry.labelKey),
      entry.hintKey ? t(entry.hintKey) : "",
      categoryLabel,
      entry.aliases ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).slice(0, 40);
});

function scrollSettingsToTop() {
  settingsContentEl.value?.scrollTo({ top: 0, behavior: "smooth" });
}

/** Motty settingsSearchKey: Escape clears the query, Enter opens the first hit, "/" focuses search. */
function onSettingsSearchKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && settingsSearch.value) {
    event.preventDefault();
    event.stopPropagation();
    settingsSearch.value = "";
    return;
  }
  if (event.key === "Enter" && settingsSearchResults.value.length) {
    event.preventDefault();
    jumpToSettingsEntry(settingsSearchResults.value[0]!);
  }
}

function onSettingsWorkspaceKeydown(event: KeyboardEvent) {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable);
  if (event.key === "/" && !typing) {
    event.preventDefault();
    settingsSearchInputEl.value?.focus();
  }
}

function jumpToSettingsEntry(entry: SettingsSearchEntry) {
  settingsSearch.value = "";
  settingsCategory.value = entry.category;
  if (entry.manage) {
    openManage(entry.manage);
    return;
  }
  void nextTick(() => {
    const node = settingsContentEl.value?.querySelector(`[data-settings-anchor="${entry.anchor}"]`);
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    scrollSettingsToTop();
  });
}

/** Motty lineFor: clicking the pref words flips the switch beside them. */
function onSettingsContentClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".settings-pref-control, button, a, input, textarea, [data-slot='select-trigger'], [role='radiogroup']")) return;
  const pref = target.closest(".settings-pref");
  if (!pref || pref.classList.contains("settings-pref--stack")) return;
  const toggle = pref.querySelector<HTMLElement>("[data-slot='switch'], button[role='switch']");
  if (!toggle || toggle.hasAttribute("disabled") || toggle.getAttribute("aria-disabled") === "true") return;
  event.preventDefault();
  toggle.click();
}

/** Motty highlight dialog: six terminal-slot colors (pink → purple). */
const HIGHLIGHT_PALETTE = ["#ec4899", "#facc15", "#22c55e", "#22d3ee", "#3b82f6", "#a855f7"];
const SFTP_COLUMN_OPTIONS: readonly SftpColumn[] = ["size", "modified", "owner", "group", "permissions"];
const highlightSaving = ref(false);
const highlightDraftError = ref("");
const highlightDraft = reactive({
  id: undefined as string | undefined,
  pattern: "",
  color: HIGHLIGHT_COLOR_DEFAULT,
  isRegex: false,
  caseSensitive: false,
});
/** Motty: add/edit is a modal; the rule list lives in its own manage dialog. */
const highlightEditorOpen = ref(false);
const highlightReturnToManage = ref(false);
const highlightManageOpen = ref(false);
const autofillManageOpen = ref(false);
const railManageOpen = ref(false);
const autofillEditorOpen = ref(false);
const autofillDraftError = ref("");
const autofillDraft = reactive({
  id: undefined as string | undefined,
  name: "",
  pattern: "",
  fixedText: "",
  appendEnter: true,
  enabled: true,
});
const quickManageOpen = ref(false);
const startupManageOpen = ref(false);
const modelsManageOpen = ref(false);
/** Add form for quick commands, opened from the settings card (list stays in the manage dialog). */
const quickAddOpen = ref(false);
const quickCommandList = computed(() => props.quickCommands ?? []);
const canAddQuickCommand = computed(
  () =>
    canAddQuickCommandInScope(quickCommandList.value, props.connectionId || null) ||
    canAddQuickCommandInScope(quickCommandList.value, null),
);
/** focusAnchor → which manage dialog to open when settings is opened from the palette. */
const MANAGE_ANCHORS: Readonly<Record<string, ManageTarget>> = {
  "rail-items": "rail",
  "resource-quick": "quick",
  "resource-startup": "startup",
  "resource-models": "models",
  "resource-highlight": "highlight",
  "resource-autofill": "autofill",
};

function openManage(target: ManageTarget) {
  if (target === "quick") quickManageOpen.value = true;
  else if (target === "startup") startupManageOpen.value = true;
  else if (target === "models") modelsManageOpen.value = true;
  else if (target === "autofill") autofillManageOpen.value = true;
  else if (target === "rail") railManageOpen.value = true;
  else highlightManageOpen.value = true;
}

function closeManageDialogs() {
  quickManageOpen.value = false;
  startupManageOpen.value = false;
  modelsManageOpen.value = false;
  highlightManageOpen.value = false;
  autofillManageOpen.value = false;
  railManageOpen.value = false;
  autofillEditorOpen.value = false;
  quickAddOpen.value = false;
  highlightReturnToManage.value = false;
  startupReturnToManage.value = false;
  modelsReturnToManage.value = false;
}

function clearAutofillDraft() {
  autofillDraft.id = undefined;
  autofillDraft.name = "";
  autofillDraft.pattern = "";
  autofillDraft.fixedText = "";
  autofillDraft.appendEnter = true;
  autofillDraft.enabled = true;
  autofillDraftError.value = "";
}

function openAutofillCreate() {
  if (props.autofillRules.length >= AUTOFILL_RULES_LIMIT) return;
  clearAutofillDraft();
  autofillEditorOpen.value = true;
}

function openAutofillEdit(rule: AutofillRule) {
  autofillDraft.id = rule.id;
  autofillDraft.name = rule.name;
  autofillDraft.pattern = rule.pattern;
  autofillDraft.fixedText = rule.fixedText;
  autofillDraft.appendEnter = rule.appendEnter;
  autofillDraft.enabled = rule.enabled;
  autofillDraftError.value = "";
  autofillEditorOpen.value = true;
}

function saveAutofillDraft() {
  const sanitized = sanitizeAutofillRuleInput({
    id: autofillDraft.id,
    name: autofillDraft.name,
    pattern: autofillDraft.pattern,
    fixedText: autofillDraft.fixedText,
    appendEnter: autofillDraft.appendEnter,
    enabled: autofillDraft.enabled,
  });
  if (!sanitized.ok) {
    autofillDraftError.value = t(sanitized.error);
    return;
  }
  const next = [...props.autofillRules];
  const index = next.findIndex((rule) => rule.id === sanitized.rule.id);
  if (index >= 0) next[index] = sanitized.rule;
  else {
    if (next.length >= AUTOFILL_RULES_LIMIT) return;
    next.push(sanitized.rule);
  }
  emit("update:autofillRules", next);
  autofillEditorOpen.value = false;
  clearAutofillDraft();
}

function toggleAutofillRule(rule: AutofillRule) {
  emit(
    "update:autofillRules",
    props.autofillRules.map((item) => (item.id === rule.id ? { ...item, enabled: !item.enabled } : item)),
  );
}

function deleteAutofillRule(id: string) {
  emit(
    "update:autofillRules",
    props.autofillRules.filter((item) => item.id !== id),
  );
}

function openQuickAdd() {
  if (!canAddQuickCommand.value) return;
  quickAddOpen.value = true;
}

/** Called by App after a successful save from the settings-card add form. */
function onQuickCommandSaved() {
  quickAddOpen.value = false;
}

function manageFromAnchor(anchor?: string | null): ManageTarget | null {
  const key = anchor?.trim() ?? "";
  return MANAGE_ANCHORS[key] ?? null;
}

function clearHighlightDraftFields() {
  highlightDraft.id = undefined;
  highlightDraft.pattern = "";
  highlightDraft.color = HIGHLIGHT_PALETTE[0] ?? HIGHLIGHT_COLOR_DEFAULT;
  highlightDraft.isRegex = false;
  highlightDraft.caseSensitive = false;
  highlightDraftError.value = "";
}

function resetHighlightDraft() {
  clearHighlightDraftFields();
  highlightEditorOpen.value = false;
  highlightReturnToManage.value = false;
}

function closeHighlightEditor() {
  const returnToManage = highlightReturnToManage.value;
  clearHighlightDraftFields();
  highlightEditorOpen.value = false;
  highlightReturnToManage.value = false;
  if (returnToManage) highlightManageOpen.value = true;
}

function openHighlightManage() {
  highlightManageOpen.value = true;
}

function openHighlightCreate(fromManage = false) {
  if (props.highlightRules.length >= HIGHLIGHT_RULES_LIMIT) return;
  clearHighlightDraftFields();
  highlightReturnToManage.value = fromManage === true;
  if (fromManage === true) highlightManageOpen.value = false;
  highlightEditorOpen.value = true;
}

async function saveHighlightRule() {
  if (highlightSaving.value) return;
  const sanitized = sanitizeHighlightRuleInput({
    pattern: highlightDraft.pattern,
    color: highlightDraft.color,
    isRegex: highlightDraft.isRegex,
    caseSensitive: highlightDraft.caseSensitive,
  });
  if (sanitized.error || !sanitized.value) {
    highlightDraftError.value = t(sanitized.error ?? "highlightRules.invalidPattern");
    return;
  }
  if (!highlightDraft.id && props.highlightRules.length >= HIGHLIGHT_RULES_LIMIT) return;
  highlightSaving.value = true;
  highlightDraftError.value = "";
  try {
    const response = await window.datawisePlugin.invoke<{ rules: unknown }>("ssh/highlightRules/save", {
      id: highlightDraft.id ?? "",
      pattern: sanitized.value.pattern,
      isRegex: sanitized.value.isRegex,
      color: sanitized.value.color,
      caseSensitive: sanitized.value.caseSensitive,
    });
    emit("highlight-rules-changed", normalizeHighlightRules(response.rules));
    closeHighlightEditor();
  } catch (cause) {
    highlightDraftError.value = settingsErrorOf(cause);
  } finally {
    highlightSaving.value = false;
  }
}

function editHighlightRule(item: HighlightRuleView) {
  highlightDraft.id = item.id;
  highlightDraft.pattern = item.pattern;
  highlightDraft.color = item.color;
  highlightDraft.isRegex = item.isRegex;
  highlightDraft.caseSensitive = item.caseSensitive;
  highlightDraftError.value = "";
  highlightReturnToManage.value = highlightManageOpen.value;
  if (highlightManageOpen.value) highlightManageOpen.value = false;
  highlightEditorOpen.value = true;
}

async function toggleHighlightRule(item: HighlightRuleView) {
  try {
    const response = await window.datawisePlugin.invoke<{ rules: unknown }>("ssh/highlightRules/save", {
      id: item.id,
      pattern: item.pattern,
      isRegex: item.isRegex,
      color: item.color,
      caseSensitive: item.caseSensitive,
      enabled: !item.enabled,
    });
    emit("highlight-rules-changed", normalizeHighlightRules(response.rules));
  } catch (cause) {
    emit("error", cause);
  }
}

async function deleteHighlightRule(id: string) {
  try {
    const response = await window.datawisePlugin.invoke<{ rules: unknown }>("ssh/highlightRules/delete", { id });
    emit("highlight-rules-changed", normalizeHighlightRules(response.rules));
    if (highlightDraft.id === id) resetHighlightDraft();
  } catch (cause) {
    emit("error", cause);
  }
}

function onSettingsCategoryChange(value: string | number) {
  settingsCategory.value = value as SettingsCategory;
  settingsSearch.value = "";
  void nextTick(scrollSettingsToTop);
}

function bumpTerminalFontSize(delta: number) {
  const next = clampFontSize(Number(terminalFontSizeDraft.value || props.terminalFontSize) + delta);
  terminalFontSizeDraft.value = String(next);
  applyTerminalFontFromControls();
}

function presetSwatches(preset: TerminalAppearanceProfile): string[] {
  if (preset.id === "preset-host") {
    return props.hostColorScheme === "dark"
      ? ["#171717", "#cacaca", "#ff615a", "#b1e969", "#5da9f6", "#e86aff"]
      : ["#ffffff", "#4d4d4c", "#c82829", "#718c00", "#4271ae", "#8959a8"];
  }
  const id = props.hostColorScheme === "light" ? preset.settings.lightSchemeId : preset.settings.darkSchemeId;
  const scheme = findScheme(props.terminalAppearance.customSchemes, id)
    ?? schemeCatalog.value.find((entry) => entry.id === id)
    ?? null;
  if (!scheme) return ["#222", "#eee", "#e06c75", "#98c379", "#61afef", "#c678dd"];
  return [scheme.background, scheme.foreground, ...scheme.colors.slice(1, 5)];
}

// reka Select 不接受空串 option value（空串 = 未选中占位）；空值选项用哨兵值双向映射。
const SELECT_EMPTY_SENTINEL = "__empty__";
const settingsLoading = ref(false);
const settingsLoadFailed = ref(false);
const settingsSaving = ref(false);
const settingsMeta = ref<SshSettings>();
const settingsDraft = reactive({
  quickSudo: true,
  sudoUsePty: false,
  sudoPassword: "",
  totpSecret: "",
  authFlowMode: "password_then_otp",
  passwordPromptHint: "",
  totpPromptHint: "",
  quickSudoProfileId: "",
  agentTerminalMode: "off",
  rememberedCommands: [] as string[],
});
/**
 * beta.49 TDZ 防线：`watch(() => props.open, ..., { immediate: true })` 在 setup
 * 期间立即调用 reloadSettings()，后者第一行就写 prefsReady.value；另外 1619 的
 * immediate watch 也会读它。声明必须早于这些 watch，否则抛 `ReferenceError:
 * Cannot access 'X' before initialization`（X 为压缩后变量名，报错落在
 * `Uncaught (in promise)`，设置面板状态会半初始化）。故提到草稿 ref 区顶部。
 */
const prefsReady = ref(false);
const downloadDirDraft = ref("");
const downloadUseDefaultDraft = ref(props.downloadPrefs.loadUseDefault());
const downloadConflictDraft = ref<DownloadConflictPolicy>("rename");
const compressionStrategyDraft = ref<CompressionStrategy>("smart");
const SFTP_NAME_ENCODINGS = ["auto", "utf8", "latin1"] as const;
type SftpNameEncoding = (typeof SFTP_NAME_ENCODINGS)[number];
function sanitizeSftpNameEncoding(value: unknown): SftpNameEncoding {
  const raw = typeof value === "string" ? value.trim().toLowerCase().replace(/_/g, "-") : "";
  if (raw === "utf-8" || raw === "utf8") return "utf8";
  if (raw === "latin-1" || raw === "latin1") return "latin1";
  return "auto";
}
const sftpNameEncodingDraft = ref<SftpNameEncoding>("auto");
const sftpNameEncodingBusy = ref(false);
const startupBucket = ref<StartupCommandsBucket>(emptyStartupBucket());
const startupStoreRaw = ref<unknown>({});
const startupBusy = ref(false);
const x11Forwarding = ref(false);
const x11Busy = ref(false);
const copilotLlmSaving = ref(false);
const copilotLlmTesting = ref(false);
const copilotLlmTestResult = ref<{ ok: boolean; message: string } | null>(null);
type CopilotModelRow = {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  configured: boolean;
  active: boolean;
};
const copilotModels = ref<CopilotModelRow[]>([]);
const copilotActiveId = ref("");
const copilotModelEditing = ref(false);
const copilotModelDraft = reactive({
  id: "",
  label: "",
  baseUrl: "",
  model: "",
  apiKey: "",
  enabled: true,
  hasApiKey: false,
});

// Startup commands are added/edited in a modal (same pattern as quick commands).
const startupEditorOpen = ref(false);
const startupEditorIndex = ref<number | null>(null);
/** Editing from the manage list: hide the list, restore it when the form closes. */
const startupReturnToManage = ref(false);
const modelsReturnToManage = ref(false);
const startupDraft = reactive({
  command: "",
  delayMs: STARTUP_DELAY_DEFAULT_MS as number,
  enabled: true,
});

function openStartupEditor(index?: number) {
  const editing = typeof index === "number" ? startupBucket.value.commands[index] : undefined;
  startupEditorIndex.value = editing ? index ?? null : null;
  startupDraft.command = editing?.command ?? "";
  startupDraft.delayMs = editing?.delayMs ?? STARTUP_DELAY_DEFAULT_MS;
  startupDraft.enabled = editing?.enabled ?? true;
  if (startupManageOpen.value) {
    startupReturnToManage.value = true;
    startupManageOpen.value = false;
  }
  startupEditorOpen.value = true;
}

function closeStartupEditor() {
  const back = startupReturnToManage.value;
  startupReturnToManage.value = false;
  startupEditorOpen.value = false;
  startupEditorIndex.value = null;
  if (back) startupManageOpen.value = true;
}

function submitStartupDraft() {
  const command = startupDraft.command.trimEnd().replace(/[\r\n]+$/g, "");
  if (!command.trim()) return;
  const index = startupEditorIndex.value;
  if (index === null && !canAddStartupCommand(startupBucket.value)) return;
  const row = {
    command: command.slice(0, 4096),
    delayMs: startupDraft.delayMs,
    enabled: startupDraft.enabled,
  };
  const commands = [...startupBucket.value.commands];
  if (index === null) commands.push(row);
  else if (index < commands.length) commands[index] = row;
  startupBucket.value = { ...startupBucket.value, commands };
  // deep watch on startupBucket schedules the persist.
  closeStartupEditor();
}

function removeStartupRow(index: number) {
  startupBucket.value = {
    ...startupBucket.value,
    commands: startupBucket.value.commands.filter((_, i) => i !== index),
  };
}

function moveStartupRow(index: number, delta: number) {
  const next = [...startupBucket.value.commands];
  const target = index + delta;
  if (target < 0 || target >= next.length) return;
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row);
  startupBucket.value = { ...startupBucket.value, commands: next };
}

async function loadStartupCommands() {
  const connectionId = (props.connectionId || "").trim();
  try {
    const prefs = await window.datawisePlugin.invoke<{
      startup_commands?: unknown;
      x11_forwarding?: boolean;
      sftpNameEncoding?: unknown;
    }>("local/preferences/get", {});
    startupStoreRaw.value = prefs?.startup_commands ?? {};
    x11Forwarding.value = prefs?.x11_forwarding === true;
    sftpNameEncodingDraft.value = sanitizeSftpNameEncoding(prefs?.sftpNameEncoding);
    if (!connectionId) {
      startupBucket.value = emptyStartupBucket();
      return;
    }
    const store = prefs?.startup_commands;
    const bucket =
      store && typeof store === "object" && !Array.isArray(store)
        ? sanitizeStartupBucket((store as Record<string, unknown>)[connectionId])
        : emptyStartupBucket();
    startupBucket.value = bucket;
  } catch {
    startupBucket.value = emptyStartupBucket();
    startupStoreRaw.value = {};
    x11Forwarding.value = false;
    sftpNameEncodingDraft.value = "auto";
  }
}

async function onSftpNameEncodingChange(value: string | number) {
  if (sftpNameEncodingBusy.value) return;
  const next = sanitizeSftpNameEncoding(value);
  if (next === sftpNameEncodingDraft.value) return;
  sftpNameEncodingBusy.value = true;
  const previous = sftpNameEncodingDraft.value;
  sftpNameEncodingDraft.value = next;
  try {
    await window.datawisePlugin.invoke("local/preferences/set", { sftpNameEncoding: next });
  } catch (cause) {
    sftpNameEncodingDraft.value = previous;
    emit("error", cause);
  } finally {
    sftpNameEncodingBusy.value = false;
  }
}

async function onX11ForwardingChange(value: boolean) {
  if (x11Busy.value) return;
  x11Busy.value = true;
  const previous = x11Forwarding.value;
  x11Forwarding.value = value === true;
  try {
    await window.datawisePlugin.invoke("local/preferences/set", {
      x11_forwarding: x11Forwarding.value,
    });
  } catch (cause) {
    x11Forwarding.value = previous;
    emit("error", cause);
  } finally {
    x11Busy.value = false;
  }
}

async function saveStartupCommands() {
  const connectionId = (props.connectionId || "").trim();
  if (!connectionId || startupBusy.value) return;
  startupBusy.value = true;
  try {
    const merged = mergeStartupStore(startupStoreRaw.value, connectionId, startupBucket.value);
    const prefs = await window.datawisePlugin.invoke<{ startup_commands?: unknown }>("local/preferences/set", {
      startup_commands: merged,
    });
    startupStoreRaw.value = prefs?.startup_commands ?? merged;
    startupBucket.value = sanitizeStartupBucket(
      prefs?.startup_commands && typeof prefs.startup_commands === "object"
        ? (prefs.startup_commands as Record<string, unknown>)[connectionId]
        : startupBucket.value,
    );
  } finally {
    startupBusy.value = false;
  }
}
const compressionThresholdDraft = ref("64");
// 全局 quick sudo 配置：列表与编辑表单状态（密钥只在提交时发送）。设置弹窗
// 内联 section 与独立 profiles 弹窗共存复用同一份状态。
const sudoProfiles = ref<SudoProfileView[]>([]);
const sudoProfilesLoading = ref(false);
const sudoProfilesError = ref("");
const profilesInlineOpen = ref(false);
const profileEditing = ref(false);
const profileSaving = ref(false);
const profileDraftHadPassword = ref(false);
const profileDraftHadTotp = ref(false);
const profileDraft = reactive({
  id: "",
  name: "",
  sudoPassword: "",
  totpSecret: "",
  authFlowMode: "password_then_otp",
  passwordPromptHint: "",
  totpPromptHint: "",
  sudoUsePty: false,
});
const boundProfile = computed(
  () => sudoProfiles.value.find((profile) => profile.id === settingsDraft.quickSudoProfileId),
);
const knownHosts = ref<KnownHostEntry[]>([]);
const knownHostsLoading = ref(false);
const knownHostsError = ref("");
const localKeys = ref<DiscoveredKey[]>([]);
const localKeysLoading = ref(false);
const localKeysError = ref("");
const mcpDraft = reactive({ readMiB: "", uploadMiB: "", downloadMiB: "", permissionMode: "autonomous", connectionScope: "" });
const mcpLoading = ref(false);
const mcpError = ref("");
const mcpSaving = ref(false);
const mcpInputsValid = computed(() => [mcpDraft.readMiB, mcpDraft.uploadMiB, mcpDraft.downloadMiB]
  .every((value) => /^\d+$/.test(value.trim()) && Number.parseInt(value.trim(), 10) > 0));

// 终端字体设置控件态（issue #31）：预设等宽字体 + 跟随宿主 + 自定义；哨兵值
// 只作选择器键使用，不会作为字体串写入（写入前映射回 null/真实字体串）。
const TERMINAL_FONT_FOLLOW_HOST = "__follow-host__";
const TERMINAL_FONT_CUSTOM = "__custom__";
const TERMINAL_FONT_PRESETS: Array<{ value: string; label: string }> = [
  { value: "'JetBrains Mono', Consolas, monospace", label: "JetBrains Mono" },
  { value: "'Cascadia Code', 'Cascadia Mono', monospace", label: "Cascadia Code" },
  { value: "'Fira Code', monospace", label: "Fira Code" },
  { value: "'Source Code Pro', monospace", label: "Source Code Pro" },
  { value: "Menlo, Monaco, monospace", label: "Menlo" },
  { value: "Consolas, 'Courier New', monospace", label: "Consolas" },
  { value: "'DejaVu Sans Mono', monospace", label: "DejaVu Sans Mono" },
  { value: "monospace", label: "monospace" },
];
const TERMINAL_FONT_WEIGHTS: Array<{ value: number; labelKey: string }> = [
  { value: 400, labelKey: "terminalFont.weightNormal" },
  { value: 500, labelKey: "terminalFont.weightMedium" },
  { value: 600, labelKey: "terminalFont.weightSemibold" },
  { value: 700, labelKey: "terminalFont.weightBoldLabel" },
];
const terminalFontFamilyChoice = ref(TERMINAL_FONT_FOLLOW_HOST);
const terminalFontCustomDraft = ref("");
const terminalFontSizeDraft = ref(String(props.terminalFontSize));

/** 预览用的已解析字体族 / 字号：跟随宿主时用宿主终端字体 CSS 变量。 */
const previewFontFamily = computed(() => {
  if (terminalFontFamilyChoice.value === TERMINAL_FONT_FOLLOW_HOST) return "var(--terminal-font-family)";
  if (terminalFontFamilyChoice.value === TERMINAL_FONT_CUSTOM) {
    return terminalFontCustomDraft.value.trim() || "var(--terminal-font-family)";
  }
  return terminalFontFamilyChoice.value;
});
const previewFontSize = computed(() => {
  const parsed = Number(terminalFontSizeDraft.value);
  return Number.isFinite(parsed) && parsed > 0 ? clampFontSize(parsed, 0) : props.hostFontSize;
});

// 字体控件回显当前覆盖态：初始化与应用/恢复默认后都会刷新，避免草稿漂移。
function syncFontControls(family: string | null, size: number) {
  if (!family) {
    terminalFontFamilyChoice.value = TERMINAL_FONT_FOLLOW_HOST;
    terminalFontCustomDraft.value = "";
  } else if (TERMINAL_FONT_PRESETS.some((preset) => preset.value === family)) {
    terminalFontFamilyChoice.value = family;
    terminalFontCustomDraft.value = "";
  } else {
    terminalFontFamilyChoice.value = TERMINAL_FONT_CUSTOM;
    terminalFontCustomDraft.value = family;
  }
  terminalFontSizeDraft.value = String(size);
}
syncFontControls(loadTerminalFontOverride().fontFamily, props.terminalFontSize);

// 外部编辑器草稿（transfer 面板）：随主「保存」落库。
const editorConfigDraft = ref<EditorConfig>({ associations: [], customEditors: [], uploadPolicy: "auto" });
const editorKnownEditors = ref<KnownEditor[]>([]);
const editorAssociationPatternDraft = ref("");
const editorAssociationTargetDraft = ref("");
const editorDefaultDraft = ref("system");
const editorTargetOptions = computed(() => [
  ...editorKnownEditors.value.filter((editor) => editor.available).map((editor) => ({ value: `known:${editor.id}`, label: editor.name })),
  ...editorConfigDraft.value.customEditors.map((editor) => ({ value: `custom:${editor.id}`, label: editor.name })),
]);
function editorTargetName(target: string): string {
  if (target.startsWith("custom:")) {
    const id = target.slice(7);
    return editorConfigDraft.value.customEditors.find((editor) => editor.id === id)?.name || id;
  }
  if (target.startsWith("known:")) {
    const id = target.slice(6);
    return editorKnownEditors.value.find((editor) => editor.id === id)?.name || id;
  }
  return target;
}
function associationTargetValue(assoc: EditorAssociation): string {
  return assoc.customId ? `custom:${assoc.customId}` : assoc.editorId ? `known:${assoc.editorId}` : "";
}
function editorDefaultValue(config: EditorConfig): string {
  return config.defaultCustomId
    ? `custom:${config.defaultCustomId}`
    : config.defaultEditorId
      ? `known:${config.defaultEditorId}`
      : "system";
}
function addEditorAssociation() {
  const pattern = editorAssociationPatternDraft.value.trim();
  const target = editorAssociationTargetDraft.value;
  if (!pattern || !target) return;
  const assoc: EditorAssociation = target.startsWith("custom:")
    ? { pattern, customId: target.slice("custom:".length) }
    : { pattern, editorId: target.slice("known:".length) };
  editorConfigDraft.value = { ...editorConfigDraft.value, associations: [...editorConfigDraft.value.associations, assoc] };
  editorAssociationPatternDraft.value = "";
  editorAssociationTargetDraft.value = "";
}
function removeEditorAssociation(index: number) {
  editorConfigDraft.value = {
    ...editorConfigDraft.value,
    associations: editorConfigDraft.value.associations.filter((_, i) => i !== index),
  };
}
function removeCustomEditor(id: string) {
  editorConfigDraft.value = {
    ...editorConfigDraft.value,
    customEditors: editorConfigDraft.value.customEditors.filter((editor) => editor.id !== id),
    associations: editorConfigDraft.value.associations.filter((assoc) => assoc.customId !== id),
  };
  if (editorDefaultDraft.value === `custom:${id}`) editorDefaultDraft.value = "system";
}

const builtinSchemes = ref(getBuiltinTerminalSchemes());
const schemeCatalog = computed(() => [...builtinSchemes.value, ...props.terminalAppearance.customSchemes]);
const quickPresets = computed(() =>
  QUICK_PRESET_IDS.map((id) => TERMINAL_APPEARANCE_PRESETS.find((preset) => preset.id === id)).filter(
    (preset): preset is TerminalAppearanceProfile => !!preset,
  ),
);

async function hydrateBuiltinSchemes() {
  builtinSchemes.value = await ensureBuiltinSchemeCatalog();
}

function patchTerminalAppearance(patch: Partial<TerminalAppearanceState["settings"]>) {
  emit("update:terminalAppearance", {
    ...props.terminalAppearance,
    settings: sanitizeAppearanceSettings({ ...props.terminalAppearance.settings, ...patch }),
  });
}

function isPresetActive(preset: TerminalAppearanceProfile): boolean {
  const settings = props.terminalAppearance.settings;
  if (preset.id === "preset-host") return settings.schemeSource === "host";
  return settings.schemeSource === "custom"
    && settings.darkSchemeId === preset.settings.darkSchemeId
    && settings.lightSchemeId === preset.settings.lightSchemeId
    && settings.backgroundSource === "scheme";
}

function applyAppearancePreset(preset: TerminalAppearanceProfile) {
  emit("update:terminalAppearance", {
    ...props.terminalAppearance,
    settings: sanitizeAppearanceSettings({ ...props.terminalAppearance.settings, ...preset.settings }),
    font: { ...preset.font },
  });
  // Font lands through the existing App channel so Ctrl+wheel zoom stays consistent.
  emit("apply-font", {
    family: preset.font.family,
    size: preset.font.size ?? props.hostFontSize,
  });
  if (preset.id !== "preset-host") schemeBrowserOpen.value = false;
}

function onSchemeSourceCustom() {
  // Empty slots look like "no change" — seed a vivid default for the live host mode.
  const defaults = props.hostColorScheme === "light"
    ? { darkSchemeId: "dracula", lightSchemeId: "solarized-light" }
    : { darkSchemeId: "dracula", lightSchemeId: "solarized-light" };
  const current = props.terminalAppearance.settings;
  patchTerminalAppearance({
    schemeSource: "custom",
    backgroundSource: "scheme",
    darkSchemeId: current.darkSchemeId ?? defaults.darkSchemeId,
    lightSchemeId: current.lightSchemeId ?? defaults.lightSchemeId,
  });
  schemeBrowserOpen.value = true;
}

function onSchemePick(payload: { slot: "dark" | "light"; id: string | null }) {
  const key = payload.slot === "dark" ? "darkSchemeId" : "lightSchemeId";
  // Always paint the full scheme (bg + ANSI). Host-bg mode is easy to miss as "no change".
  patchTerminalAppearance({
    schemeSource: "custom",
    backgroundSource: "scheme",
    [key]: payload.id,
  });
}

// ---- 自定义配色方案编辑/导入（对标 motty scheme.go 的色卡编辑 + 导入抽屉）----
type SchemeDraft = {
  id: string | null;
  name: string;
  foreground: string;
  background: string;
  cursor: string;
  selectionBackground: string;
  colors: string[];
};

function emptySchemeDraft(): SchemeDraft {
  return {
    id: null,
    name: "",
    foreground: "#d4d4d4",
    background: "#1e1e1e",
    cursor: "#aeafad",
    selectionBackground: "",
    colors: [
      "#1e1e1e", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#e5e5e5",
      "#808080", "#ff6a6a", "#5ce65c", "#ffff55", "#6ab0ff", "#f98cf9", "#66e0e0", "#ffffff",
    ],
  };
}

const schemeEditorOpen = ref(false);
const schemeDraft = reactive<SchemeDraft>(emptySchemeDraft());
const schemeDraftError = ref("");
/** 编辑时记住原始 id：sanitizeCustomScheme 的 taken 必须排除自身，否则会被改成 -2。 */
const schemeEditingId = ref<string | null>(null);

/** 草稿方案供预览卡复用：临时构造一个只含草稿的 state，走与真实一致的解析路径。 */
const draftPreviewState = computed<TerminalAppearanceState>(() => ({
  ...props.terminalAppearance,
  settings: {
    ...props.terminalAppearance.settings,
    schemeSource: "custom",
    backgroundSource: "scheme",
    darkSchemeId: "__draft__",
    lightSchemeId: "__draft__",
  },
  customSchemes: [{
    id: "__draft__",
    name: schemeDraft.name || "Draft",
    foreground: normalizeHexColor(schemeDraft.foreground) ?? "#d4d4d4",
    background: normalizeHexColor(schemeDraft.background) ?? "#1e1e1e",
    cursor: normalizeHexColor(schemeDraft.cursor) ?? normalizeHexColor(schemeDraft.foreground) ?? "#aeafad",
    colors: schemeDraft.colors.map((color) => normalizeHexColor(color) ?? "#808080"),
    source: "custom",
  }],
}));

function resetSchemeDraft() {
  Object.assign(schemeDraft, emptySchemeDraft());
  schemeDraftError.value = "";
  schemeEditingId.value = null;
}

function openSchemeCreate() {
  resetSchemeDraft();
  schemeEditorOpen.value = true;
}

function openSchemeEdit(scheme: TerminalColorScheme) {
  resetSchemeDraft();
  schemeEditingId.value = scheme.id;
  schemeDraft.id = scheme.id;
  schemeDraft.name = scheme.name;
  schemeDraft.foreground = scheme.foreground;
  schemeDraft.background = scheme.background;
  schemeDraft.cursor = scheme.cursor;
  schemeDraft.selectionBackground = scheme.selectionBackground ?? "";
  schemeDraft.colors = Array.from({ length: 16 }, (_, index) => scheme.colors[index] ?? "#808080");
  schemeEditorOpen.value = true;
}

function closeSchemeEditor() {
  schemeEditorOpen.value = false;
  resetSchemeDraft();
}

function takenSchemeIds(excludeId: string | null = null): string[] {
  return props.terminalAppearance.customSchemes
    .map((scheme) => scheme.id)
    .filter((id) => id !== excludeId);
}

/** 新增或更新自定义方案；所有 hex 经 sanitizeCustomScheme 校验后才落库。 */
function saveSchemeDraft() {
  const taken = takenSchemeIds(schemeEditingId.value);
  const raw = {
    id: schemeEditingId.value ?? undefined,
    name: schemeDraft.name.trim(),
    foreground: schemeDraft.foreground,
    background: schemeDraft.background,
    cursor: schemeDraft.cursor,
    selectionBackground: schemeDraft.selectionBackground.trim() || undefined,
    colors: schemeDraft.colors,
  };
  const sanitized = sanitizeCustomScheme(raw, taken);
  if (!sanitized) {
    schemeDraftError.value = t("terminalAppearance.invalidScheme");
    return;
  }
  if (props.terminalAppearance.customSchemes.length >= CUSTOM_SCHEME_LIMIT && !schemeEditingId.value) {
    schemeDraftError.value = t("terminalAppearance.schemeLimit", { count: CUSTOM_SCHEME_LIMIT });
    return;
  }
  const next = schemeEditingId.value
    ? props.terminalAppearance.customSchemes.map((scheme) => (scheme.id === schemeEditingId.value ? sanitized : scheme))
    : [...props.terminalAppearance.customSchemes, sanitized];
  emit("update:terminalAppearance", { ...props.terminalAppearance, customSchemes: next });
  closeSchemeEditor();
  emit("notice", t("terminalAppearance.schemeSaved"));
}

function deleteCustomScheme(scheme: TerminalColorScheme) {
  if (!window.confirm(t("terminalAppearance.deleteSchemeConfirm", { name: scheme.name }))) return;
  const next = props.terminalAppearance.customSchemes.filter((entry) => entry.id !== scheme.id);
  const settings = { ...props.terminalAppearance.settings };
  // 删除正被槽位引用的方案时同步清空槽位，避免 UI 显示与生效态不一致。
  if (settings.darkSchemeId === scheme.id) settings.darkSchemeId = null;
  if (settings.lightSchemeId === scheme.id) settings.lightSchemeId = null;
  emit("update:terminalAppearance", {
    ...props.terminalAppearance,
    settings: sanitizeAppearanceSettings(settings),
    customSchemes: next,
  });
  emit("notice", t("terminalAppearance.schemeDeleted"));
}

// ---- 方案导入（Tabby / iTerm2 / Windows Terminal / Xresources 文本粘贴）----
const schemeImportOpen = ref(false);
const schemeImportText = ref("");
const schemeImportError = ref("");
const schemeImportRows = ref<Array<{ index: number; name: string; hexes: string[] }>>([]);
const schemeImportFormat = ref("");
const schemeImportSelected = ref<number[]>([]);

function closeSchemeImport() {
  schemeImportOpen.value = false;
  schemeImportText.value = "";
  schemeImportError.value = "";
  schemeImportRows.value = [];
  schemeImportFormat.value = "";
  schemeImportSelected.value = [];
}

function previewSchemeImport() {
  const result = parseSchemeImport(schemeImportText.value, t("terminalAppearance.importFallbackName"));
  if (!result.schemes.length) {
    schemeImportRows.value = [];
    schemeImportFormat.value = "";
    schemeImportError.value = t("terminalAppearance.importFailed");
    return;
  }
  schemeImportError.value = "";
  schemeImportFormat.value = result.format;
  schemeImportRows.value = result.schemes.map((scheme, index) => ({
    index,
    name: scheme.name,
    hexes: [scheme.background, scheme.foreground, ...scheme.colors.slice(1, 6)],
  }));
  schemeImportSelected.value = result.schemes.map((_scheme, index) => index);
}

function toggleSchemeImportRow(index: number) {
  schemeImportSelected.value = schemeImportSelected.value.includes(index)
    ? schemeImportSelected.value.filter((value) => value !== index)
    : [...schemeImportSelected.value, index];
}

function applySchemeImport() {
  const result = parseSchemeImport(schemeImportText.value, t("terminalAppearance.importFallbackName"));
  const taken = takenSchemeIds();
  const additions: TerminalColorScheme[] = [];
  for (const index of schemeImportSelected.value) {
    const scheme = result.schemes[index];
    if (!scheme) continue;
    if (additions.length + props.terminalAppearance.customSchemes.length >= CUSTOM_SCHEME_LIMIT) break;
    const raw = {
      id: uniqueSchemeId(schemeIdFromName(scheme.name), [...taken, ...additions.map((entry) => entry.id)]),
      ...scheme,
    };
    const sanitized = sanitizeCustomScheme(raw, [...taken, ...additions.map((entry) => entry.id)]);
    if (sanitized) additions.push(sanitized);
  }
  if (!additions.length) {
    schemeImportError.value = t("terminalAppearance.importFailed");
    return;
  }
  emit("update:terminalAppearance", {
    ...props.terminalAppearance,
    customSchemes: [...props.terminalAppearance.customSchemes, ...additions],
  });
  closeSchemeImport();
  emit("notice", t("terminalAppearance.importSuccess", { count: additions.length }));
}

// 设置页字体族下拉：跟随宿主/预设即时应用并持久化；选「自定义」时仅展开
// 输入框，待输入 @change 再应用（applyTerminalFontFromControls）。
function onTerminalFontFamilyChoice(choice: string) {
  terminalFontFamilyChoice.value = choice;
  if (choice === TERMINAL_FONT_CUSTOM) return;
  applyTerminalFont(choice === TERMINAL_FONT_FOLLOW_HOST ? null : choice, props.terminalFontSize);
}

function applyTerminalFontFromControls() {
  let family: string | null;
  if (terminalFontFamilyChoice.value === TERMINAL_FONT_CUSTOM) {
    const custom = terminalFontCustomDraft.value.trim();
    family = custom.length > 0 ? custom : null; // 空自定义视作跟随宿主
  } else if (terminalFontFamilyChoice.value === TERMINAL_FONT_FOLLOW_HOST) {
    family = null;
  } else {
    family = terminalFontFamilyChoice.value;
  }
  const parsed = Number(terminalFontSizeDraft.value);
  const size = Number.isFinite(parsed) && parsed > 0 ? clampFontSize(parsed, 0) : props.hostFontSize;
  applyTerminalFont(family, size);
}

// 恢复默认：清掉用户设置（连字号键一起删），回到宿主基准。
function resetTerminalFont() {
  applyTerminalFont(null, props.hostFontSize);
}

/** Motty 逐节 Reset：外观与显示项回到默认值（不影响用户自建方案/主题库）。 */
function resetTerminalAppearance() {
  emit("update:terminalAppearance", {
    ...props.terminalAppearance,
    settings: { ...DEFAULT_TERMINAL_APPEARANCE_SETTINGS },
  });
  resetTerminalFont();
  emit("notice", t("terminalAppearance.resetDone"));
}

/// 应用用户字体设置：应用侧（App）负责落到 xterm、持久化与 toast。
function applyTerminalFont(family: string | null, size: number) {
  emit("apply-font", { family, size });
  syncFontControls(family, size);
}

async function reloadSettings() {
  prefsReady.value = false;
  downloadDirDraft.value = props.downloadPrefs.loadDir();
  downloadUseDefaultDraft.value = props.downloadPrefs.loadUseDefault();
  downloadConflictDraft.value = props.downloadPrefs.loadConflict();
  compressionStrategyDraft.value = props.downloadPrefs.loadCompression();
  compressionThresholdDraft.value = String(props.downloadPrefs.loadCompressionThreshold());
  editorConfigDraft.value = props.editorPrefs.loadConfig();
  editorDefaultDraft.value = editorDefaultValue(editorConfigDraft.value);
  void props.editorPrefs.reloadEditors().then((list) => { editorKnownEditors.value = list; });
  if (settingsLoading.value || settingsSaving.value) {
    await nextTick();
    prefsReady.value = true;
    return;
  }
  settingsLoading.value = true;
  settingsLoadFailed.value = false;
  settingsMeta.value = undefined;
  // 每次打开都回到收起态，并丢弃上次遗留的内联编辑草稿：
  // 主「保存」会串行提交未保存的 profile 编辑，不能把陈旧草稿静默入库。
  profilesInlineOpen.value = false;
  cancelProfileEdit();
  void loadKnownHosts();
  void loadLocalKeys();
  void loadMcpSettings();
  void loadSudoProfiles();
  void loadStartupCommands();
  try {
    // revealSecrets: 预填已存原值（原始凭据串），避免只能看到"已配置"占位。
    const meta = await window.datawisePlugin.invoke<SshSettings>("ssh/settings/get", { sessionId: props.sessionId, revealSecrets: true });
    settingsMeta.value = meta;
    settingsDraft.quickSudo = meta.quickSudo;
    settingsDraft.sudoUsePty = meta.sudoUsePty;
    settingsDraft.authFlowMode = meta.authFlowMode || "password_then_otp";
    settingsDraft.passwordPromptHint = meta.passwordPromptHint || "";
    settingsDraft.totpPromptHint = meta.totpPromptHint || "";
    settingsDraft.quickSudoProfileId = meta.quickSudoProfileId || "";
    const agentMode = meta.agentTerminalMode;
    settingsDraft.agentTerminalMode = agentMode && (AGENT_MODES as readonly string[]).includes(agentMode) ? agentMode : "off";
    settingsDraft.rememberedCommands = sanitizeRememberedCommands(meta.rememberedCommands);
    settingsDraft.sudoPassword = meta.sudoPassword || "";
    settingsDraft.totpSecret = meta.totpSecret || "";
  } catch {
    settingsLoadFailed.value = true;
  } finally {
    // Always finish BYOK list load before releasing the loading gate so the
    // Agent pane cannot flash "0 / 12" against a still-populated dock picker.
    await loadCopilotLlm();
    settingsLoading.value = false;
    await nextTick();
    prefsReady.value = true;
  }
}

async function scrollToFocusAnchor() {
  const anchor = props.focusAnchor?.trim();
  if (!anchor) return;
  await nextTick();
  const node = settingsContentEl.value?.querySelector(`[data-settings-anchor="${anchor}"]`);
  if (node instanceof HTMLElement) {
    node.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

watch(() => props.open, (open) => {
  if (!open) {
    prefsReady.value = false;
    cancelCopilotModelEdit();
    closeManageDialogs();
    highlightEditorOpen.value = false;
    startupEditorOpen.value = false;
    return;
  }
  if (props.focusCategory) {
    settingsCategory.value = props.focusCategory;
  }
  void hydrateBuiltinSchemes();
  void reloadSettings().then(async () => {
    const manageTarget = manageFromAnchor(props.focusAnchor);
    if (manageTarget) openManage(manageTarget);
    if (props.focusAddModel && props.focusCategory === "agent") {
      modelsManageOpen.value = true;
      // Only jump into "add model" when the store is actually empty.
      if (!copilotModels.value.length) startCopilotModelCreate();
    }
    if (!manageTarget && !props.focusAddModel) await scrollToFocusAnchor();
  });
}, { immediate: true });

watch(() => props.focusAnchor, (anchor) => {
  if (!props.open) return;
  const target = manageFromAnchor(anchor);
  if (target) openManage(target);
});

watch(settingsCategory, (id) => {
  if (id === "security") {
    void loadKnownHosts();
    void loadLocalKeys();
  }
  if (id === "terminal") resetHighlightDraft();
  if (id === "sudo") void loadSshConfigSync();
});

watch(
  () => props.open,
  (open) => {
    if (open && settingsCategory.value === "terminal") resetHighlightDraft();
  },
);

watch(
  [downloadDirDraft, downloadUseDefaultDraft, downloadConflictDraft, compressionStrategyDraft, compressionThresholdDraft],
  () => {
    if (!prefsReady.value) return;
    persistDownloadDrafts();
  },
);

watch(
  [editorConfigDraft, editorDefaultDraft],
  () => {
    if (!prefsReady.value) return;
    persistEditorDraft();
  },
  { deep: true },
);

watch(
  startupBucket,
  () => {
    scheduleStartupPersist();
  },
  { deep: true },
);

// Motty: toggling / choosing applies immediately (secrets stay on blur — see onSecretFieldBlur).
watch(
  () => [
    settingsDraft.quickSudo,
    settingsDraft.sudoUsePty,
    settingsDraft.authFlowMode,
    settingsDraft.passwordPromptHint,
    settingsDraft.totpPromptHint,
    settingsDraft.quickSudoProfileId,
    settingsDraft.agentTerminalMode,
    settingsDraft.rememberedCommands.slice(),
  ],
  () => {
    scheduleSettingsPersist();
  },
);

watch(
  mcpDraft,
  () => {
    scheduleMcpPersist();
  },
  { deep: true },
);

watch(() => props.profilesOpen, (open) => {
  if (!open) return;
  profileEditing.value = false;
  resetProfileDraft();
  void loadSudoProfiles();
}, { immediate: true });

async function loadSudoProfiles() {
  sudoProfilesLoading.value = true;
  sudoProfilesError.value = "";
  try {
    const result = await window.datawisePlugin.invoke<{ profiles: SudoProfileView[] }>("sudo/profiles/list", {});
    sudoProfiles.value = result.profiles;
  } catch (cause) {
    sudoProfiles.value = [];
    sudoProfilesError.value = settingsErrorOf(cause);
  } finally {
    sudoProfilesLoading.value = false;
  }
}

function flowModeLabel(mode: string) {
  if (mode === "off") return t("flowOff");
  if (mode === "password_only") return t("flowOnly");
  if (mode === "password_plus_otp") return t("flowPlusOtp");
  return t("flowThenOtp");
}

function profileSummary(profile: SudoProfileView) {
  return [
    `${t("settingsSudoPassword")}: ${profile.sudoPasswordSet ? t("settingsConfigured") : "—"}`,
    `${t("settingsTotp")}: ${profile.totpConfigured ? t("settingsConfigured") : "—"}`,
    t("settingsFlowMode") + ": " + flowModeLabel(profile.authFlowMode),
    profile.sudoUsePty ? t("settingsUsePty") : "",
  ].filter(Boolean).join(" · ");
}

function resetProfileDraft() {
  profileDraft.id = "";
  profileDraft.name = "";
  profileDraft.sudoPassword = "";
  profileDraft.totpSecret = "";
  profileDraft.authFlowMode = "password_then_otp";
  profileDraft.passwordPromptHint = "";
  profileDraft.totpPromptHint = "";
  profileDraft.sudoUsePty = false;
  profileDraftHadPassword.value = false;
  profileDraftHadTotp.value = false;
}

function startProfileCreate() {
  resetProfileDraft();
  profileEditing.value = true;
}

function startProfileEdit(profile: SudoProfileView) {
  resetProfileDraft();
  profileDraft.id = profile.id;
  profileDraft.name = profile.name;
  profileDraft.authFlowMode = profile.authFlowMode || "password_then_otp";
  profileDraft.passwordPromptHint = profile.passwordPromptHint || "";
  profileDraft.totpPromptHint = profile.totpPromptHint || "";
  profileDraft.sudoUsePty = profile.sudoUsePty;
  profileDraftHadPassword.value = profile.sudoPasswordSet;
  profileDraftHadTotp.value = profile.totpConfigured;
  profileEditing.value = true;
  // 回显已存原值供编辑（工作台专用 reveal 方法；失败保持占位提示）。
  if (profile.sudoPasswordSet || profile.totpConfigured) {
    const editingId = profile.id;
    void window.datawisePlugin
      .invoke<{ profile: { sudoPassword?: string; totpSecret?: string } }>("sudo/profiles/reveal", { id: editingId })
      .then((revealed) => {
        if (profileEditing.value && profileDraft.id === editingId) {
          profileDraft.sudoPassword = revealed.profile?.sudoPassword || "";
          profileDraft.totpSecret = revealed.profile?.totpSecret || "";
        }
      })
      .catch(() => undefined);
  }
}

async function saveProfileDraft() {
  if (profileSaving.value) return;
  const name = profileDraft.name.trim();
  if (!name) {
    sudoProfilesError.value = t("profilesNameRequired");
    return;
  }
  profileSaving.value = true;
  sudoProfilesError.value = "";
  try {
    const payload: Record<string, unknown> = {
      authFlowMode: profileDraft.authFlowMode,
      passwordPromptHint: profileDraft.passwordPromptHint,
      totpPromptHint: profileDraft.totpPromptHint,
      sudoUsePty: profileDraft.sudoUsePty,
    };
    if (profileDraft.id) payload.id = profileDraft.id;
    payload.name = name;
    if (profileDraft.sudoPassword) payload.sudoPassword = profileDraft.sudoPassword;
    if (profileDraft.totpSecret.trim()) payload.totpSecret = profileDraft.totpSecret;
    await window.datawisePlugin.invoke("sudo/profiles/save", payload);
    profileEditing.value = false;
    resetProfileDraft();
    await loadSudoProfiles();
    await refreshSettingsMeta();
    emit("notice", t("profilesSaved"));
  } catch (cause) {
    sudoProfilesError.value = settingsErrorOf(cause);
  } finally {
    profileSaving.value = false;
  }
}

async function removeProfile(profile: SudoProfileView) {
  if (!window.confirm(t("profilesDeleteConfirm", { name: profile.name }))) return;
  try {
    await window.datawisePlugin.invoke("sudo/profiles/delete", { id: profile.id });
    if (settingsDraft.quickSudoProfileId === profile.id) settingsDraft.quickSudoProfileId = "";
    await loadSudoProfiles();
    await refreshSettingsMeta();
    emit("notice", t("profilesDeleted"));
  } catch (cause) {
    sudoProfilesError.value = settingsErrorOf(cause);
  }
}

/// 取消内联 profile 编辑：关表单并清空草稿/错误（独立 profiles 弹窗、
/// 设置弹窗内联 section 与 Esc 关闭链共用同一语义）。
function cancelProfileEdit() {
  profileEditing.value = false;
  resetProfileDraft();
  sudoProfilesError.value = "";
}

/// 全局配置或其绑定变化后，刷新设置弹窗的只读摘要（会话内即时生效）。
async function refreshSettingsMeta() {
  if (!props.open || !props.sessionId) return;
  try {
    settingsMeta.value = await window.datawisePlugin.invoke<SshSettings>("ssh/settings/get", { sessionId: props.sessionId });
  } catch {
    // 摘要刷新失败不打断主流程；重新打开设置时会再次加载。
  }
}

async function loadKnownHosts() {
  knownHostsLoading.value = true;
  knownHostsError.value = "";
  try {
    const result = await window.datawisePlugin.invoke<{ entries?: KnownHostEntry[] }>("ssh/knownHosts/list", {});
    knownHosts.value = Array.isArray(result?.entries) ? result.entries : [];
  } catch (cause) {
    knownHosts.value = [];
    knownHostsError.value = settingsErrorOf(cause);
  } finally {
    knownHostsLoading.value = false;
  }
}

async function removeKnownHost(entry: KnownHostEntry) {
  if (!window.confirm(t("knownHosts.removeConfirm", { host: `${entry.host}:${entry.port}` }))) return;
  try {
    await window.datawisePlugin.invoke("ssh/knownHosts/remove", { host: entry.host, port: entry.port });
    emit("notice", t("knownHosts.removed", { host: `${entry.host}:${entry.port}` }));
  } catch (cause) {
    knownHostsError.value = settingsErrorOf(cause);
  } finally {
    await loadKnownHosts();
  }
}

// ---- ~/.ssh/config 双向同步（对标 motty ssh_sync.go）----
const sshSyncLoading = ref(false);
const sshSyncBusy = ref(false);
const sshSyncRead = ref<SshConfigReadResult | null>(null);
const sshSyncError = ref("");
const sshSyncPathDraft = ref("");
const sshSyncImportRows = ref<ReturnType<typeof parseSshConfigImport>["sessions"]>([]);
const sshSyncImportLoading = ref(false);
const sshSyncImportBusy = ref(false);
const hostConnections = ref<Array<{ id?: string; name?: string; host?: string; port?: number; username?: string; user?: string }>>([]);
const hostConnectionsLoading = ref(false);

async function loadSshConfigSync() {
  sshSyncLoading.value = true;
  sshSyncError.value = "";
  try {
    const result = parseSshConfigRead(
      await window.datawisePlugin.invoke("sshConfig/read", {}),
    );
    sshSyncRead.value = result;
    sshSyncPathDraft.value = result?.path ?? "";
  } catch (cause) {
    sshSyncRead.value = null;
    sshSyncError.value = sshConfigErrorOf(cause);
  } finally {
    sshSyncLoading.value = false;
  }
}

async function toggleSshConfigSync(enabled: boolean) {
  sshSyncBusy.value = true;
  sshSyncError.value = "";
  try {
    const path = sshSyncPathDraft.value.trim();
    await window.datawisePlugin.invoke("sshConfig/settings", {
      enabled,
      path: path || null,
    });
    emit("notice", enabled ? t("sshSync.enabled") : t("sshSync.disabled"));
  } catch (cause) {
    sshSyncError.value = sshConfigErrorOf(cause);
  } finally {
    sshSyncBusy.value = false;
    await loadSshConfigSync();
  }
}

async function saveSshConfigPath() {
  if (!sshSyncPathDraft.value.trim()) return;
  await toggleSshConfigSync(sshSyncRead.value?.enabled ?? false);
}

async function previewSshConfigImport() {
  sshSyncImportLoading.value = true;
  sshSyncError.value = "";
  try {
    const result = parseSshConfigImport(
      await window.datawisePlugin.invoke("sshConfig/import", {}),
    );
    sshSyncImportRows.value = result.sessions;
    if (!result.sessions.length && result.notes.length) {
      emit("notice", result.notes[0]!);
    }
  } catch (cause) {
    sshSyncImportRows.value = [];
    sshSyncError.value = sshConfigErrorOf(cause);
  } finally {
    sshSyncImportLoading.value = false;
  }
}

async function applySshConfigImport() {
  if (!sshSyncImportRows.value.length) return;
  sshSyncImportBusy.value = true;
  sshSyncError.value = "";
  try {
    const drafts = sshConfigHostDrafts(sshSyncImportRows.value);
    const result = await createHostConnectionsFromImport(drafts as Parameters<typeof createHostConnectionsFromImport>[0]);
    if (!result) {
      emit("error", new Error(t("sshSync.importUnavailable")));
      return;
    }
    await window.datawisePlugin.invoke("sshConfig/ackImport", {
      aliases: sshSyncImportRows.value.map((row) => row.name),
      hosts: sshSyncImportRows.value.map((row) => ({
        alias: row.name,
        name: row.name,
        host: row.host,
        user: row.username,
        port: row.port,
      })),
    });
    emit("notice", t("sshSync.imported", { count: result.count }));
    sshSyncImportRows.value = [];
    await loadSshConfigSync();
  } catch (cause) {
    sshSyncError.value = sshConfigErrorOf(cause);
  } finally {
    sshSyncImportBusy.value = false;
  }
}

async function loadHostConnections() {
  hostConnectionsLoading.value = true;
  try {
    const result = await window.datawisePlugin.request<{ connections?: Array<Record<string, unknown>> }>("host.listConnections");
    hostConnections.value = (Array.isArray(result?.connections) ? result.connections : [])
      .filter((entry) => typeof entry?.host === "string" || typeof entry?.name === "string")
      .map((entry) => ({
        id: typeof entry.id === "string" ? entry.id : undefined,
        name: typeof entry.name === "string" ? entry.name : undefined,
        host: typeof entry.host === "string" ? entry.host : undefined,
        port: typeof entry.port === "number" ? entry.port : undefined,
        username: typeof entry.username === "string" ? entry.username : undefined,
        user: typeof entry.user === "string" ? entry.user : undefined,
      }));
  } catch {
    // Older hosts have no listConnections extension: export degrades to the
    // current connection only (passed explicitly by the caller).
    hostConnections.value = [];
  } finally {
    hostConnectionsLoading.value = false;
  }
}

async function exportSshConfig() {
  const connections = hostConnections.value.length
    ? hostConnections.value
    : [{
        id: props.connectionId,
        name: props.connection?.name,
        host: props.connection?.host,
        port: props.connection?.port,
        username: props.connection?.username,
      }];
  if (!connections.some((entry) => (entry.host ?? "").trim())) {
    emit("notice", t("sshSync.noConnections"));
    return;
  }
  sshSyncBusy.value = true;
  sshSyncError.value = "";
  try {
    const result = parseSshConfigExport(
      await window.datawisePlugin.invoke("sshConfig/export", {
        connections,
        expectedStamp: sshSyncRead.value?.stamp,
      }),
    );
    if (!result) throw new Error(t("sshSync.exportFailed"));
    emit("notice", t("sshSync.exported", { count: result.wrote }));
    await loadSshConfigSync();
  } catch (cause) {
    sshSyncError.value = sshConfigErrorOf(cause);
  } finally {
    sshSyncBusy.value = false;
  }
}

async function loadLocalKeys() {
  localKeysLoading.value = true;
  localKeysError.value = "";
  try {
    const result = await window.datawisePlugin.invoke<{ keys?: DiscoveredKey[] }>("keys/discover", {});
    const keys = Array.isArray(result?.keys) ? result.keys : [];
    localKeys.value = keys.map((key) => ({ ...key, hasPassphrase: key.hasPassphrase ?? key.has_passphrase === true }));
  } catch (cause) {
    localKeys.value = [];
    localKeysError.value = settingsErrorOf(cause);
  } finally {
    localKeysLoading.value = false;
  }
}

async function loadMcpSettings() {
  mcpLoading.value = true;
  mcpError.value = "";
  try {
    const result = await window.datawisePlugin.invoke<McpSizeSettings>("mcp/settings/get", {});
    mcpDraft.readMiB = mibField(result.maxReadBytes);
    mcpDraft.uploadMiB = mibField(result.maxUploadBytes);
    mcpDraft.downloadMiB = mibField(result.maxDownloadBytes);
    // §1.3 新字段：旧 sidecar 不回时用默认（autonomous / 空=不限）。
    mcpDraft.permissionMode = result.execPermissionMode === "confirm" ? "confirm" : "autonomous";
    mcpDraft.connectionScope = Array.isArray(result.connectionScope) ? result.connectionScope.join("\n") : "";
  } catch (cause) {
    mcpError.value = settingsErrorOf(cause);
  } finally {
    mcpLoading.value = false;
  }
}

function applyCopilotStatus(status: {
  activeId?: string;
  profiles?: unknown;
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  hasApiKey?: boolean;
  configured?: boolean;
} | null | undefined) {
  const rows: CopilotModelRow[] = [];
  if (Array.isArray(status?.profiles)) {
    for (const item of status.profiles) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id) continue;
      const model = typeof row.model === "string" ? row.model : "";
      const labelRaw = typeof row.label === "string" ? row.label.trim() : "";
      rows.push({
        id,
        label: labelRaw || model || id,
        baseUrl: typeof row.baseUrl === "string" ? row.baseUrl : "",
        model,
        enabled: row.enabled !== false,
        hasApiKey: row.hasApiKey === true,
        configured: row.configured === true,
        active: row.active === true || id === status?.activeId,
      });
    }
  }
  // profiles missing/empty/unparseable → fall back to flat status fields so the
  // settings list cannot disagree with a dock that still sees configured BYOK.
  if (
    !rows.length &&
    status &&
    (status.baseUrl || status.model || status.hasApiKey || status.enabled || status.configured)
  ) {
    const model = typeof status.model === "string" ? status.model : "";
    const id =
      (typeof status.activeId === "string" && status.activeId.trim()) || "default";
    rows.push({
      id,
      label: model || id,
      baseUrl: typeof status.baseUrl === "string" ? status.baseUrl : "",
      model,
      enabled: status.enabled !== false,
      hasApiKey: status.hasApiKey === true,
      configured:
        status.configured === true ||
        !!(status.enabled && status.baseUrl && status.model && status.hasApiKey),
      active: true,
    });
  }
  copilotModels.value = rows;
  copilotActiveId.value =
    (typeof status?.activeId === "string" && status.activeId) ||
    rows.find((r) => r.active)?.id ||
    rows[0]?.id ||
    "";
}

async function loadCopilotLlm() {
  try {
    const status = await window.datawisePlugin.invoke<{
      enabled?: boolean;
      baseUrl?: string;
      model?: string;
      hasApiKey?: boolean;
      configured?: boolean;
      activeId?: string;
      profiles?: unknown;
    }>("ssh/copilot/llm/status", {});
    applyCopilotStatus(status);
    // Keep dock picker in sync with the same status snapshot.
    emit("copilot-llm-saved");
  } catch (cause) {
    copilotModels.value = [];
    copilotActiveId.value = "";
    emit("error", cause);
  }
}

function resetCopilotModelDraft() {
  copilotModelDraft.id = "";
  copilotModelDraft.label = "";
  copilotModelDraft.baseUrl = "";
  copilotModelDraft.model = "";
  copilotModelDraft.apiKey = "";
  copilotModelDraft.enabled = true;
  copilotModelDraft.hasApiKey = false;
  copilotLlmTestResult.value = null;
}

function startCopilotModelCreate() {
  if (copilotModels.value.length >= COPILOT_MODEL_LIMIT) return;
  resetCopilotModelDraft();
  if (modelsManageOpen.value) {
    modelsReturnToManage.value = true;
    modelsManageOpen.value = false;
  }
  copilotModelEditing.value = true;
}

function startCopilotModelEdit(row: CopilotModelRow) {
  copilotModelDraft.id = row.id;
  copilotModelDraft.label = row.label;
  copilotModelDraft.baseUrl = row.baseUrl;
  copilotModelDraft.model = row.model;
  copilotModelDraft.apiKey = "";
  copilotModelDraft.enabled = row.enabled;
  copilotModelDraft.hasApiKey = row.hasApiKey;
  copilotLlmTestResult.value = null;
  if (modelsManageOpen.value) {
    modelsReturnToManage.value = true;
    modelsManageOpen.value = false;
  }
  copilotModelEditing.value = true;
}

function cancelCopilotModelEdit() {
  const back = modelsReturnToManage.value;
  modelsReturnToManage.value = false;
  copilotModelEditing.value = false;
  resetCopilotModelDraft();
  if (back) modelsManageOpen.value = true;
}

const canTestCopilotModel = computed(() => {
  if (!copilotModelDraft.baseUrl.trim() || !copilotModelDraft.model.trim()) return false;
  return !!(copilotModelDraft.apiKey.trim() || copilotModelDraft.hasApiKey);
});

async function testCopilotModelDraft() {
  if (copilotLlmTesting.value || !canTestCopilotModel.value) return;
  copilotLlmTesting.value = true;
  copilotLlmTestResult.value = null;
  try {
    const params: Record<string, unknown> = {
      baseUrl: copilotModelDraft.baseUrl.trim(),
      model: copilotModelDraft.model.trim(),
    };
    if (copilotModelDraft.id) params.id = copilotModelDraft.id;
    if (copilotModelDraft.apiKey.trim()) params.apiKey = copilotModelDraft.apiKey.trim();
    const result = await window.datawisePlugin.invoke<{
      ok?: boolean;
      latencyMs?: number;
      model?: string;
      reply?: string;
    }>("ssh/copilot/llm/test", params);
    const ms = typeof result?.latencyMs === "number" ? result.latencyMs : 0;
    copilotLlmTestResult.value = {
      ok: true,
      message: t("copilot.settingsTestOk", {
        ms,
        model: typeof result?.model === "string" ? result.model : copilotModelDraft.model.trim(),
      }),
    };
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : String(cause ?? "");
    copilotLlmTestResult.value = {
      ok: false,
      message: t("copilot.settingsTestFail", { error: raw || "unknown" }),
    };
  } finally {
    copilotLlmTesting.value = false;
  }
}

async function saveCopilotModelDraft() {
  if (copilotLlmSaving.value) return;
  const model = copilotModelDraft.model.trim();
  const baseUrl = copilotModelDraft.baseUrl.trim();
  if (!model || !baseUrl) return;
  const isNew = !copilotModelDraft.id;
  if (isNew && !copilotModelDraft.apiKey.trim()) {
    emit("error", new Error(t("copilot.settingsApiKeyRequired")));
    return;
  }
  if (!isNew && !copilotModelDraft.apiKey.trim() && !copilotModelDraft.hasApiKey) {
    emit("error", new Error(t("copilot.settingsApiKeyRequired")));
    return;
  }
  copilotLlmSaving.value = true;
  try {
    const params: Record<string, unknown> = {
      action: "upsert",
      label: copilotModelDraft.label.trim() || model,
      baseUrl,
      model,
      enabled: copilotModelDraft.enabled,
      activate: !copilotModels.value.length || !copilotModelDraft.id,
    };
    if (copilotModelDraft.id) params.id = copilotModelDraft.id;
    if (copilotModelDraft.apiKey.trim()) params.apiKey = copilotModelDraft.apiKey.trim();
    const status = await window.datawisePlugin.invoke<{
      enabled?: boolean;
      baseUrl?: string;
      model?: string;
      hasApiKey?: boolean;
      activeId?: string;
      profiles?: unknown;
    }>("ssh/copilot/llm/save", params);
    applyCopilotStatus(status);
    cancelCopilotModelEdit();
    emit("notice", t("copilot.settingsSaved"));
    emit("copilot-llm-saved");
  } catch (cause) {
    emit("error", cause);
  } finally {
    copilotLlmSaving.value = false;
  }
}

async function activateCopilotModel(id: string) {
  if (copilotLlmSaving.value || !id || id === copilotActiveId.value) return;
  copilotLlmSaving.value = true;
  try {
    const status = await window.datawisePlugin.invoke<{
      activeId?: string;
      profiles?: unknown;
    }>("ssh/copilot/llm/save", { action: "activate", id });
    applyCopilotStatus(status);
    emit("copilot-llm-saved");
  } catch (cause) {
    emit("error", cause);
  } finally {
    copilotLlmSaving.value = false;
  }
}

async function deleteCopilotModel(row: CopilotModelRow) {
  if (copilotLlmSaving.value) return;
  if (!window.confirm(t("copilot.settingsDeleteConfirm", { name: row.label || row.model || row.id }))) {
    return;
  }
  copilotLlmSaving.value = true;
  try {
    const status = await window.datawisePlugin.invoke<{
      activeId?: string;
      profiles?: unknown;
    }>("ssh/copilot/llm/save", { action: "delete", id: row.id });
    applyCopilotStatus(status);
    if (copilotModelDraft.id === row.id) cancelCopilotModelEdit();
    emit("notice", t("copilot.settingsDeleted"));
    emit("copilot-llm-saved");
  } catch (cause) {
    emit("error", cause);
  } finally {
    copilotLlmSaving.value = false;
  }
}

function copilotModelSummary(row: CopilotModelRow): string {
  const parts = [row.model, row.baseUrl.replace(/^https?:\/\//, "")].filter(Boolean);
  return parts.join(" · ");
}

async function saveMcpSettings(options: { quiet?: boolean } = {}) {
  if (!mcpInputsValid.value || mcpSaving.value || mcpLoading.value) return;
  mcpSaving.value = true;
  mcpError.value = "";
  try {
    await window.datawisePlugin.invoke("mcp/settings/set", {
      maxReadBytes: Number.parseInt(mcpDraft.readMiB.trim(), 10) * MIB,
      maxUploadBytes: Number.parseInt(mcpDraft.uploadMiB.trim(), 10) * MIB,
      maxDownloadBytes: Number.parseInt(mcpDraft.downloadMiB.trim(), 10) * MIB,
      // §1.3 MCP 权限档 + 连接作用域（每行一条，trim 去空后提交；旧 sidecar
      // 不识别新字段时整体报错，经 mcpError 容错展示）。
      execPermissionMode: mcpDraft.permissionMode === "confirm" ? "confirm" : "autonomous",
      connectionScope: mcpDraft.connectionScope.split("\n").map((line) => line.trim()).filter(Boolean),
    });
    if (!options.quiet) emit("notice", t("mcpLimits.saved"));
  } catch (cause) {
    mcpError.value = settingsErrorOf(cause);
  } finally {
    mcpSaving.value = false;
  }
}

/** MCP 与 ssh/settings 解耦：无 session / settings 加载失败时仍可落盘。 */
let mcpPersistTimer = 0;
function scheduleMcpPersist() {
  if (!props.open || mcpLoading.value || mcpSaving.value || !mcpInputsValid.value) return;
  window.clearTimeout(mcpPersistTimer);
  mcpPersistTimer = window.setTimeout(() => {
    void saveMcpSettings({ quiet: true });
  }, 320);
}

let startupPersistTimer = 0;

function persistDownloadDrafts() {
  props.downloadPrefs.persistDir(downloadDirDraft.value);
  props.downloadPrefs.persistUseDefault(downloadUseDefaultDraft.value);
  props.downloadPrefs.persistConflict(downloadConflictDraft.value);
  const threshold = Number.parseInt(compressionThresholdDraft.value.trim(), 10);
  props.downloadPrefs.persistCompression(
    compressionStrategyDraft.value,
    Number.isFinite(threshold) ? threshold : 64,
  );
}

function persistEditorDraft() {
  props.editorPrefs.persistConfig({
    ...editorConfigDraft.value,
    defaultEditorId: editorDefaultDraft.value.startsWith("known:") ? editorDefaultDraft.value.slice("known:".length) : undefined,
    defaultCustomId: editorDefaultDraft.value.startsWith("custom:") ? editorDefaultDraft.value.slice("custom:".length) : undefined,
  });
}

function scheduleStartupPersist() {
  if (!prefsReady.value || !(props.connectionId || "").trim()) return;
  window.clearTimeout(startupPersistTimer);
  startupPersistTimer = window.setTimeout(() => {
    void saveStartupCommands();
  }, 280);
}

/**
 * Motty-style persist: most fields save as you change them.
 * Secrets (sudo password / TOTP) only go out on blur or when leaving the page,
 * so mid-typing never truncates the draft field.
 */
async function saveSettings(options: { quiet?: boolean; includeSecrets?: boolean } = {}) {
  if (settingsSaving.value || settingsLoading.value) return;
  settingsSaving.value = true;
  try {
    persistDownloadDrafts();
    persistEditorDraft();
    await saveStartupCommands();
    if (props.sessionId && settingsMeta.value && !settingsLoadFailed.value) {
      if (profileEditing.value) await saveProfileDraft();
      const updates: Record<string, unknown> = {
        quickSudo: settingsDraft.quickSudo,
        sudoUsePty: settingsDraft.sudoUsePty,
        authFlowMode: settingsDraft.authFlowMode,
        passwordPromptHint: settingsDraft.passwordPromptHint,
        totpPromptHint: settingsDraft.totpPromptHint,
        quickSudoProfileId: settingsDraft.quickSudoProfileId,
        agentTerminalMode: settingsDraft.agentTerminalMode,
        rememberedCommands: sanitizeRememberedCommands(settingsDraft.rememberedCommands),
      };
      const includeSecrets = options.includeSecrets === true;
      if (includeSecrets) {
        if (settingsDraft.sudoPassword) updates.sudoPassword = settingsDraft.sudoPassword;
        if (settingsDraft.totpSecret.trim()) updates.totpSecret = settingsDraft.totpSecret;
      }
      const meta = await window.datawisePlugin.invoke<SshSettings>("ssh/settings/set", { sessionId: props.sessionId, ...updates });
      settingsMeta.value = meta;
      if (includeSecrets) {
        settingsDraft.sudoPassword = "";
        settingsDraft.totpSecret = "";
      }
    }
    if (!options.quiet) emit("notice", t("settingsSaved"));
  } catch (cause) {
    emit("error", cause);
  } finally {
    settingsSaving.value = false;
  }
}

let settingsPersistTimer = 0;
function scheduleSettingsPersist() {
  if (!props.open || settingsLoading.value || settingsLoadFailed.value || !settingsMeta.value) return;
  window.clearTimeout(settingsPersistTimer);
  settingsPersistTimer = window.setTimeout(() => {
    void saveSettings({ quiet: true, includeSecrets: false });
  }, 320);
}

function onSecretFieldBlur() {
  if (!settingsDraft.sudoPassword && !settingsDraft.totpSecret.trim()) return;
  window.clearTimeout(settingsPersistTimer);
  void saveSettings({ quiet: true, includeSecrets: true });
}

/** 关窗前落盘；供 Esc / 关闭按钮 / Dialog dismiss 共用。 */
async function flushSettings() {
  window.clearTimeout(startupPersistTimer);
  window.clearTimeout(settingsPersistTimer);
  window.clearTimeout(mcpPersistTimer);
  await Promise.all([
    saveSettings({ quiet: true, includeSecrets: true }),
    saveMcpSettings({ quiet: true }),
  ]);
}

async function closeSettings() {
  await flushSettings();
  emit("update:open", false);
}

async function onSettingsOpenChange(value: boolean) {
  if (value) {
    emit("update:open", true);
    return;
  }
  await flushSettings();
  emit("update:open", false);
}

async function clearStoredSecrets() {
  if (!props.sessionId || settingsSaving.value || settingsLoading.value || settingsLoadFailed.value || !settingsMeta.value) return;
  try {
    const meta = await window.datawisePlugin.invoke<SshSettings>("ssh/settings/set", {
      sessionId: props.sessionId,
      sudoPassword: "",
      totpSecret: "",
    });
    settingsMeta.value = meta;
    emit("notice", t("settingsSecretsCleared"));
  } catch (cause) {
    emit("error", cause);
  }
}

/// Esc 分层退出：先关编辑表单，再收起配置档 section；返回 false 表示已到
/// 最底层，调用方（App Esc 链）应关闭整个弹窗。
function consumeInlineEsc(): boolean {
  if (profilesInlineOpen.value && profileEditing.value) {
    cancelProfileEdit();
    return true;
  }
  if (profilesInlineOpen.value) {
    profilesInlineOpen.value = false;
    return true;
  }
  return false;
}

/// 下载询问弹窗勾选「设为默认」/目录选择器回填后，App 同步设置页草稿
/// （弹窗开着也能立即看到）。
function setDownloadDirDraft(dir: string) {
  downloadDirDraft.value = dir;
}

function setDownloadUseDefaultDraft(value: boolean) {
  downloadUseDefaultDraft.value = value;
}

function shortFingerprint(fingerprint: string) {
  if (fingerprint.length <= 20) return fingerprint;
  return `${fingerprint.slice(0, 17)}…`;
}

defineExpose({ consumeInlineEsc, flushSettings, setDownloadDirDraft, setDownloadUseDefaultDraft, onQuickCommandSaved });
</script>

<template>
    <!-- Motty-style full workbench settings page (not a modal). -->
    <div v-if="open" class="settings-workspace" role="region" :aria-label="t('settings')" @keydown="onSettingsWorkspaceKeydown">
        <!-- Motty has no chrome title bar; keep only ← / × so the nav brand can own “Settings”. -->
        <header class="settings-workspace-header settings-workspace-header--slim">
          <button type="button" class="icon-button icon-neutral" :title="t('settingsBack')" @click="closeSettings"><ArrowLeft /></button>
          <span class="settings-workspace-header-spacer" aria-hidden="true" />
          <button type="button" class="icon-button icon-neutral" :title="t('close')" @click="closeSettings"><X /></button>
        </header>
        <div class="settings-body">
          <div class="settings-layout">
            <nav class="settings-nav" aria-label="settings categories">
              <p class="settings-nav-brand">{{ t("settings") }}</p>
              <label class="settings-nav-search">
                <Search class="settings-nav-search-icon" aria-hidden="true" />
                <input
                  ref="settingsSearchInputEl"
                  v-model="settingsSearch"
                  type="search"
                  spellcheck="false"
                  :placeholder="t('settingsSearch.placeholder')"
                  :aria-label="t('settingsSearch.placeholder')"
                  @keydown="onSettingsSearchKeydown"
                />
              </label>
              <Tabs v-show="!settingsSearching" :model-value="settingsCategory" orientation="vertical" class="settings-nav-tabs" @update:model-value="onSettingsCategoryChange">
                <TabsList class="settings-nav-list">
                  <TabsTrigger v-for="cat in SETTINGS_CATEGORIES" :key="cat.id" :value="cat.id" class="settings-nav-item">
                    <component :is="cat.icon" class="settings-nav-icon" aria-hidden="true" />
                    <span>{{ t(cat.labelKey) }}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p v-if="settingsSearching" class="settings-nav-search-hint muted">{{ t("settingsSearch.navHint", { count: settingsSearchResults.length }) }}</p>
            </nav>
            <div ref="settingsContentEl" class="settings-content" @click="onSettingsContentClick">
            <!-- Motty page header: category title only (row hints carry the detail). -->
            <header class="settings-page-header">
              <h2>{{ settingsSearching ? t("settingsSearch.title") : t(activeCategory.labelKey) }}</h2>
            </header>

            <div v-if="settingsSearching" class="settings-search-results" role="list">
              <p v-if="!settingsSearchResults.length" class="empty compact">{{ t("settingsSearch.empty", { query: settingsSearch.trim() }) }}</p>
              <button
                v-for="entry in settingsSearchResults"
                :key="`${entry.category}:${entry.anchor}`"
                type="button"
                class="settings-search-result"
                role="listitem"
                @click="jumpToSettingsEntry(entry)"
              >
                <span class="settings-search-result-label">{{ t(entry.labelKey) }}</span>
                <span class="settings-search-result-cat muted">{{ t(SETTINGS_CATEGORIES.find((cat) => cat.id === entry.category)?.labelKey ?? "") }}</span>
                <span v-if="entry.hintKey" class="settings-search-result-hint muted">{{ t(entry.hintKey) }}</span>
              </button>
            </div>

            <div v-show="!settingsSearching && settingsCategory === 'sudo'" class="settings-pane">
            <section class="settings-card" data-settings-anchor="sudo">
            <div v-if="settingsLoading" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
            <div v-else-if="settingsLoadFailed" class="task-error" role="alert">
              {{ t("settingsLoadFailed") }}
              <button class="link-button" @click="reloadSettings">{{ t("refresh") }}</button>
            </div>
            <template v-else>
            <label class="settings-field">
              <span>{{ t("settingsCredentialSource") }}</span>
              <span class="credential-source-row">
                <Select :model-value="settingsDraft.quickSudoProfileId || SELECT_EMPTY_SENTINEL" @update:model-value="(v) => (settingsDraft.quickSudoProfileId = v === SELECT_EMPTY_SENTINEL ? '' : String(v))">
                  <SelectTrigger size="xs" class="credential-source-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="SELECT_EMPTY_SENTINEL">{{ t("profileSourceConnection") }}</SelectItem>
                    <SelectItem v-for="profile in sudoProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</SelectItem>
                  </SelectContent>
                </Select>
                <!-- 内联管理入口：展开/收起下方配置档 section，不再跳独立弹窗（工具栏 KeyRound 仍保留独立弹窗）。 -->
                <button class="link-button" :aria-expanded="profilesInlineOpen" @click="profilesInlineOpen = !profilesInlineOpen">{{ t("profilesManage") }}</button>
              </span>
            </label>
            <p v-if="boundProfile" class="muted settings-note">{{ t("profilesBoundSummary", { name: boundProfile.name }) }} · {{ profileSummary(boundProfile) }}</p>
            <!-- 内联 quick sudo 配置档管理：列表 + 新增/编辑同表单状态
                 （sudoProfiles/profileDraft/... 与独立 profiles 弹窗共用），主「保存」串行提交。 -->
            <section v-if="profilesInlineOpen" class="profiles-inline" data-settings-anchor="profiles">
              <h3 class="settings-section-title">{{ t("profilesTitle") }}</h3>
              <div v-if="sudoProfilesLoading && !sudoProfiles.length" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
              <div v-else-if="!sudoProfiles.length" class="empty compact">{{ t("profilesEmpty") }}</div>
              <ul v-else class="settings-list">
                <li v-for="profile in sudoProfiles" :key="profile.id">
                  <div class="settings-list-main">
                    <strong>{{ profile.name }}</strong>
                    <span class="muted">{{ profileSummary(profile) }}</span>
                  </div>
                  <span class="settings-list-actions">
                    <button class="icon-button" :title="t('profilesEdit')" @click="startProfileEdit(profile)"><Pencil /></button>
                    <button class="icon-button" :title="t('profilesDelete')" @click="removeProfile(profile)"><Trash2 /></button>
                  </span>
                </li>
              </ul>
              <p class="muted">{{ t("profilesLimit", { count: sudoProfiles.length, limit: 20 }) }}</p>
              <button v-if="!profileEditing" class="link-button" @click="startProfileCreate">{{ t("profilesAdd") }}</button>
              <template v-if="profileEditing">
                <h4 class="settings-section-title">{{ profileDraft.id ? t("profilesEdit") : t("profilesAdd") }}</h4>
                <label class="settings-field">
                  <span>{{ t("profilesName") }}</span>
                  <input v-model="profileDraft.name" spellcheck="false" :placeholder="t('profilesNamePlaceholder')" />
                </label>
                <label class="settings-field">
                  <span>{{ t("profilesPassword") }}</span>
                  <input v-model="profileDraft.sudoPassword" type="password" autocomplete="off" :placeholder="profileDraftHadPassword ? t('profilesPasswordKeep') : t('settingsSudoPasswordPlaceholder')" />
                </label>
                <label class="settings-field">
                  <span>{{ t("settingsTotp") }}</span>
                  <textarea v-model="profileDraft.totpSecret" rows="2" spellcheck="false" :placeholder="profileDraftHadTotp ? t('settingsConfigured') : t('settingsTotpPlaceholder')" />
                </label>
                <label class="settings-field">
                  <span>{{ t("settingsFlowMode") }}</span>
                  <Select :model-value="profileDraft.authFlowMode" @update:model-value="(v) => (profileDraft.authFlowMode = String(v))">
                    <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">{{ t("flowOff") }}</SelectItem>
                      <SelectItem value="password_then_otp">{{ t("flowThenOtp") }}</SelectItem>
                      <SelectItem value="password_plus_otp">{{ t("flowPlusOtp") }}</SelectItem>
                      <SelectItem value="password_only">{{ t("flowOnly") }}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label class="settings-field">
                  <span>{{ t("settingsPasswordHint") }}</span>
                  <input v-model="profileDraft.passwordPromptHint" spellcheck="false" :placeholder="t('settingsHintPlaceholder')" />
                </label>
                <label class="settings-field">
                  <span>{{ t("settingsTotpHint") }}</span>
                  <input v-model="profileDraft.totpPromptHint" spellcheck="false" :placeholder="t('settingsHintPlaceholder')" />
                </label>
                <label class="quick-sudo-control">
                  <Switch v-model="profileDraft.sudoUsePty" size="sm" />
                  <span>{{ t("settingsUsePty") }}</span>
                </label>
                <p v-if="sudoProfilesError" class="task-error">{{ sudoProfilesError }}</p>
                <footer class="profiles-form-actions">
                  <button @click="cancelProfileEdit">{{ t("cancel") }}</button>
                  <button class="primary-button" :disabled="profileSaving || !profileDraft.name.trim()" @click="saveProfileDraft"><Loader2 v-if="profileSaving" class="spinning" />{{ t("save") }}</button>
                </footer>
              </template>
            </section>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("settingsQuickSudo") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch v-model="settingsDraft.quickSudo" size="sm" />
              </div>
            </div>
            <template v-if="!boundProfile">
            <label class="settings-field">
              <span>{{ t("settingsSudoPassword") }}</span>
              <input v-model="settingsDraft.sudoPassword" type="password" autocomplete="off" :placeholder="settingsMeta?.sudoPasswordSet ? t('settingsConfigured') : t('settingsSudoPasswordPlaceholder')" @blur="onSecretFieldBlur" />
            </label>
            <label class="settings-field">
              <span>{{ t("settingsTotp") }}</span>
              <textarea v-model="settingsDraft.totpSecret" rows="2" spellcheck="false" :placeholder="settingsMeta?.totpConfigured ? t('settingsConfigured') : t('settingsTotpPlaceholder')" @blur="onSecretFieldBlur" />
            </label>
            <label class="settings-field">
              <span>{{ t("settingsFlowMode") }}</span>
              <Select :model-value="settingsDraft.authFlowMode" @update:model-value="(v) => (settingsDraft.authFlowMode = String(v))">
                <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">{{ t("flowOff") }}</SelectItem>
                  <SelectItem value="password_then_otp">{{ t("flowThenOtp") }}</SelectItem>
                  <SelectItem value="password_plus_otp">{{ t("flowPlusOtp") }}</SelectItem>
                  <SelectItem value="password_only">{{ t("flowOnly") }}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label class="settings-field">
              <span>{{ t("settingsPasswordHint") }}</span>
              <input v-model="settingsDraft.passwordPromptHint" spellcheck="false" :placeholder="t('settingsHintPlaceholder')" />
            </label>
            <label class="settings-field">
              <span>{{ t("settingsTotpHint") }}</span>
              <input v-model="settingsDraft.totpPromptHint" spellcheck="false" :placeholder="t('settingsHintPlaceholder')" />
            </label>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("settingsUsePty") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch v-model="settingsDraft.sudoUsePty" size="sm" />
              </div>
            </div>
            </template>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("settingsClearSecrets") }}</span>
                <span class="settings-pref-hint">{{ t("settingsClearSecretsHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <button
                  type="button"
                  class="settings-inline-danger"
                  :disabled="settingsLoading || settingsLoadFailed || settingsSaving || (!settingsMeta?.sudoPasswordSet && !settingsMeta?.totpConfigured)"
                  @click="clearStoredSecrets"
                ><Trash2 />{{ t("settingsClearSecrets") }}</button>
              </div>
            </div>
            <p v-if="sudoProfilesError" class="task-error">{{ sudoProfilesError }} <button class="link-button" @click="loadSudoProfiles">{{ t("refresh") }}</button></p>
            </template>
            </section>
            <section class="settings-card">
              <h3 class="settings-card-title" data-settings-anchor="x11">{{ t("settingsNav.connectionExtras") }}</h3>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("x11Forwarding.label") }}</span>
                  <span class="settings-pref-hint">{{ t("x11Forwarding.settingsHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="x11Forwarding" @update:model-value="onX11ForwardingChange" />
                </div>
              </div>
            </section>

            <section class="settings-card" data-settings-anchor="ssh-config-sync">
              <h3 class="settings-card-title">{{ t("sshSync.title") }}</h3>
              <p class="muted settings-note">{{ t("sshSync.hint") }}</p>
              <div v-if="sshSyncLoading" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
              <template v-else>
                <div class="settings-pref">
                  <div class="settings-pref-copy">
                    <span class="settings-pref-label">{{ t("sshSync.enable") }}</span>
                    <span class="settings-pref-hint">{{ t("sshSync.enableHint") }}</span>
                  </div>
                  <div class="settings-pref-control">
                    <Switch size="sm" :model-value="sshSyncRead?.enabled === true" :disabled="sshSyncBusy" @update:model-value="(value) => toggleSshConfigSync(value === true)" />
                  </div>
                </div>
                <div class="settings-field ssh-sync-path">
                  <span>{{ t("sshSync.path") }}</span>
                  <div class="ssh-sync-path-row">
                    <input v-model="sshSyncPathDraft" class="mono" spellcheck="false" :placeholder="t('sshSync.pathPlaceholder')" />
                    <button type="button" class="settings-secondary-button" :disabled="sshSyncBusy || !sshSyncPathDraft.trim()" @click="saveSshConfigPath">{{ t("save") }}</button>
                  </div>
                  <p v-if="sshSyncRead && !sshSyncRead.exists" class="muted settings-note">{{ t("sshSync.missingFile") }}</p>
                </div>

                <div class="ssh-sync-actions">
                  <span class="ssh-sync-host-count muted">
                    <SquareTerminal />{{ t("sshSync.hostCount", { count: sshSyncRead?.hosts.length ?? 0 }) }}
                  </span>
                  <div class="ssh-sync-actions-buttons">
                    <button type="button" class="settings-secondary-button" :disabled="sshSyncBusy" @click="loadSshConfigSync"><RotateCcw />{{ t("refresh") }}</button>
                    <button type="button" class="settings-secondary-button" :disabled="sshSyncBusy || sshSyncImportLoading" @click="previewSshConfigImport">
                      <Loader2 v-if="sshSyncImportLoading" class="spinning" /><Download v-else />{{ t("sshSync.previewImport") }}
                    </button>
                    <button type="button" class="primary-button" :disabled="sshSyncBusy" @click="loadHostConnections().then(exportSshConfig)">
                      <FileUp />{{ t("sshSync.export") }}
                    </button>
                  </div>
                </div>

                <ul v-if="sshSyncImportRows.length" class="settings-list ssh-sync-import-list">
                  <li v-for="(row, index) in sshSyncImportRows" :key="`${row.name}:${index}`">
                    <div class="settings-list-main">
                      <strong class="mono">{{ row.name }}</strong>
                      <span class="muted">{{ row.username || "root" }}@{{ row.host }}:{{ row.port }}<template v-if="row.keyPath"> · {{ row.keyPath }}</template></span>
                      <span v-if="row.description" class="muted">{{ row.description }}</span>
                    </div>
                  </li>
                </ul>
                <button v-if="sshSyncImportRows.length" type="button" class="primary-button ssh-sync-import-apply" :disabled="sshSyncImportBusy" @click="applySshConfigImport">
                  <Loader2 v-if="sshSyncImportBusy" class="spinning" />{{ t("sshSync.importSelected", { count: sshSyncImportRows.length }) }}
                </button>

                <ul v-if="sshSyncRead?.hosts.length" class="settings-list ssh-sync-host-list">
                  <li v-for="(host, index) in sshSyncRead.hosts" :key="`${host.alias}:${index}`">
                    <div class="settings-list-main">
                      <strong class="mono">{{ host.alias }}</strong>
                      <span class="muted">{{ host.user || "root" }}@{{ host.host }}:{{ host.port }}</span>
                      <span v-if="host.proxyJump" class="muted">{{ t("sshSync.proxyJumpNote") }}: {{ host.proxyJump }}</span>
                      <span v-if="host.managed" class="picker-badge">{{ t("sshSync.managed") }}</span>
                    </div>
                  </li>
                </ul>
                <p v-if="sshSyncError" class="task-error">{{ sshSyncError }} <button class="link-button" @click="loadSshConfigSync">{{ t("refresh") }}</button></p>
                <p v-if="sshSyncRead?.notes.length" class="muted settings-note">{{ sshSyncRead.notes.join(" · ") }}</p>
              </template>
            </section>
            </div>

            <div v-show="!settingsSearching && settingsCategory === 'agent'" class="settings-pane">
            <section class="settings-card" data-settings-anchor="agent-mode">
            <div v-if="settingsLoading" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
            <div v-else-if="settingsLoadFailed" class="task-error" role="alert">
              {{ t("settingsLoadFailed") }}
              <button class="link-button" @click="reloadSettings">{{ t("refresh") }}</button>
            </div>
            <template v-else>
            <div class="settings-pref settings-pref--stack">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("agentTerminalMode") }}</span>
                <span class="settings-pref-hint">{{ t("agentTerminalQuickHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Select :model-value="settingsDraft.agentTerminalMode" @update:model-value="(v) => (settingsDraft.agentTerminalMode = String(v))">
                  <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="mode in AGENT_MODES" :key="mode" :value="mode">{{ t(`agentTerminal${mode === "off" ? "Off" : mode === "auto" ? "Auto" : "Strict"}`) }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="settings-remembered" data-settings-anchor="remembered">
              <h4 class="settings-section-title">{{ t("settingsRemembered.section") }}</h4>
              <label class="settings-field"><span>{{ t("settingsRemembered.label") }}</span></label>
              <p v-if="!settingsDraft.rememberedCommands.length" class="muted settings-note">{{ t("settingsRemembered.empty") }}</p>
              <ul v-else class="remembered-list">
                <li v-for="(line, index) in settingsDraft.rememberedCommands" :key="`${index}-${line}`" class="remembered-row">
                  <code class="mono remembered-line">{{ line }}</code>
                  <button class="link-button" type="button" @click="settingsDraft.rememberedCommands.splice(index, 1)">{{ t("settingsRemembered.remove") }}</button>
                </li>
              </ul>
            </div>
            </template>
            </section>

            <section class="settings-card" data-settings-anchor="copilot">
              <h3 class="settings-card-title">{{ t("copilot.settingsTitle") }}</h3>
              <p class="muted settings-note">{{ t("copilot.settingsHint") }}</p>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("copilot.dockDefaultOpen") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch
                    size="sm"
                    :model-value="copilotDockDefaultOpen"
                    @update:model-value="(value) => emit('update:copilotDockDefaultOpen', value === true)"
                  />
                </div>
              </div>
              <div class="settings-pref settings-pref--stack">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("copilot.redactOutput") }}</span>
                  <span class="settings-pref-hint">{{ t("copilot.redactOutputHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch
                    size="sm"
                    :model-value="copilotRedactOutput"
                    @update:model-value="(value) => emit('update:copilotRedactOutput', value === true)"
                  />
                </div>
              </div>
              <div class="settings-pref settings-pref--stack">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("copilot.chatMode") }}</span>
                  <span class="settings-pref-hint">{{
                    copilotChatMode === "ask" ? t("copilot.chatModeAskHint") : t("copilot.chatModeAgentHint")
                  }}</span>
                </div>
                <div class="settings-pref-control">
                  <div class="copilot-mode-switch" role="radiogroup" :aria-label="t('copilot.chatMode')">
                    <button
                      type="button"
                      role="radio"
                      class="copilot-mode-btn"
                      :aria-checked="copilotChatMode === 'ask'"
                      :data-active="copilotChatMode === 'ask'"
                      @click="emit('update:copilotChatMode', 'ask')"
                    >{{ t("copilot.chatModeAsk") }}</button>
                    <button
                      type="button"
                      role="radio"
                      class="copilot-mode-btn"
                      :aria-checked="copilotChatMode === 'agent'"
                      :data-active="copilotChatMode === 'agent'"
                      @click="emit('update:copilotChatMode', 'agent')"
                    >{{ t("copilot.chatModeAgent") }}</button>
                  </div>
                </div>
              </div>

              <div class="settings-pref settings-pref--stack">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("copilot.replyLanguage") }}</span>
                  <span class="settings-pref-hint">{{ t("copilot.replyLanguageHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <div class="copilot-mode-switch" role="radiogroup" :aria-label="t('copilot.replyLanguage')">
                    <button
                      type="button"
                      role="radio"
                      class="copilot-mode-btn"
                      :aria-checked="copilotReplyLanguage === 'auto'"
                      :data-active="copilotReplyLanguage === 'auto'"
                      @click="emit('update:copilotReplyLanguage', 'auto')"
                    >{{ t("copilot.replyLanguageAuto") }}</button>
                    <button
                      type="button"
                      role="radio"
                      class="copilot-mode-btn"
                      :aria-checked="copilotReplyLanguage === 'zh-CN'"
                      :data-active="copilotReplyLanguage === 'zh-CN'"
                      @click="emit('update:copilotReplyLanguage', 'zh-CN')"
                    >{{ t("copilot.replyLanguageZh") }}</button>
                    <button
                      type="button"
                      role="radio"
                      class="copilot-mode-btn"
                      :aria-checked="copilotReplyLanguage === 'en'"
                      :data-active="copilotReplyLanguage === 'en'"
                      @click="emit('update:copilotReplyLanguage', 'en')"
                    >{{ t("copilot.replyLanguageEn") }}</button>
                  </div>
                </div>
              </div>

              <div class="settings-pref" data-settings-anchor="copilot-models">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("copilot.settingsModels") }}</span>
                  <span class="settings-pref-hint">{{ t("copilot.settingsModelsHint", { count: copilotModels.length, limit: COPILOT_MODEL_LIMIT }) }}</span>
                </div>
                <div class="settings-pref-control">
                  <button type="button" class="settings-secondary-button" @click="openManage('models')">{{ t("settingsManage") }}</button>
                </div>
              </div>

              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("copilot.settingsAdd") }}</span>
                  <span class="settings-pref-hint">{{ t("copilot.addModelHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <button type="button" class="settings-secondary-button" :disabled="copilotModels.length >= COPILOT_MODEL_LIMIT" @click="startCopilotModelCreate">{{ t("copilot.settingsAdd") }}</button>
                </div>
              </div>
            </section>
            </div>

            <div v-show="!settingsSearching && settingsCategory === 'transfer'" class="settings-pane">
            <section class="settings-card" data-settings-anchor="columns">
            <h3 class="settings-card-title">{{ t("customizeColumns") }}</h3>
            <p class="muted settings-note">{{ t("customizeColumnsHint") }}</p>
            <div
              v-for="column in SFTP_COLUMN_OPTIONS"
              :key="column"
              class="settings-pref"
            >
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t(column) }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="visibleColumns.includes(column)"
                  @update:model-value="() => emit('toggle-column', column)"
                />
              </div>
            </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="download">{{ t("downloadSettings.title") }}</h3>
            <p class="muted settings-note">{{ t(activeCategory.blurbKey) }}</p>
            <label class="settings-field">
              <span>{{ t("downloadSettings.directory") }}</span>
              <span class="settings-dir-row" :data-browse="localCanSave ? '1' : undefined">
                <input v-model="downloadDirDraft" class="mono" spellcheck="false" :placeholder="localDownloadDir || t('downloadSettings.default')" />
                <button v-if="localCanSave" type="button" class="browse-button" :title="t('downloadSettings.browse')" :aria-label="t('downloadSettings.browse')" @click="emit('browse-download-dir')"><FolderOpen /></button>
              </span>
              <span class="muted settings-note">{{ t("downloadSettings.hint") }}</span>
            </label>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("downloadSettings.useDefaultDir") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch v-model="downloadUseDefaultDraft" size="sm" />
              </div>
            </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="conflict">{{ t("downloadSettings.conflictTitle") }}</h3>
            <label v-for="policy in DOWNLOAD_CONFLICT_POLICIES" :key="policy" class="settings-field settings-radio-row">
              <input v-model="downloadConflictDraft" type="radio" name="download-conflict-policy" :value="policy" />
              <span>{{ t(`downloadSettings.conflict.${policy}`) }}</span>
            </label>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="compression">{{ t("downloadSettings.compressionTitle") }}</h3>
            <label v-for="strategy in COMPRESSION_STRATEGIES" :key="strategy" class="settings-field settings-radio-row">
              <input v-model="compressionStrategyDraft" type="radio" name="compression-strategy" :value="strategy" />
              <span>{{ t(`downloadSettings.compression.${strategy}`) }}</span>
            </label>
            <label class="settings-field">
              <span>{{ t("downloadSettings.compressionThreshold") }}</span>
              <input v-model="compressionThresholdDraft" type="number" min="0" max="4096" step="1" class="mono settings-input-narrow" />
            </label>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title">{{ t("downloadSettings.sftpNameEncoding") }}</h3>
            <label class="settings-field">
              <span>{{ t("downloadSettings.sftpNameEncoding") }}</span>
              <Select :model-value="sftpNameEncodingDraft" :disabled="sftpNameEncodingBusy" @update:model-value="onSftpNameEncodingChange">
                <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="encoding in SFTP_NAME_ENCODINGS" :key="encoding" :value="encoding">
                    {{ t(`downloadSettings.sftpNameEncoding.${encoding}`) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <p class="muted settings-note">{{ t("downloadSettings.sftpNameEncodingHint") }}</p>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="editor">{{ t("sftpEdit.settingsSection") }}</h3>
            <label class="settings-field">
              <span>{{ t("sftpEdit.defaultEditorTitle") }}</span>
              <Select :model-value="editorDefaultDraft" @update:model-value="(v) => (editorDefaultDraft = String(v))">
                <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">{{ t("sftpEdit.defaultEditorSystem") }}</SelectItem>
                  <SelectItem v-for="opt in editorTargetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <p class="muted settings-note">{{ t("sftpEdit.defaultEditorHint") }}</p>
            <h3 class="settings-card-title">{{ t("sftpEdit.uploadPolicyTitle") }}</h3>
            <label class="settings-field settings-radio-row">
              <input v-model="editorConfigDraft.uploadPolicy" type="radio" name="editor-upload-policy" value="auto" />
              <span>{{ t("sftpEdit.uploadPolicy.auto") }}</span>
            </label>
            <label class="settings-field settings-radio-row">
              <input v-model="editorConfigDraft.uploadPolicy" type="radio" name="editor-upload-policy" value="ask" />
              <span>{{ t("sftpEdit.uploadPolicy.ask") }}</span>
            </label>
            <p class="muted settings-note">{{ t("sftpEdit.uploadPolicyHint") }}</p>
            <h3 class="settings-card-title">{{ t("sftpEdit.associationsTitle") }}</h3>
            <p class="muted settings-note">{{ t("sftpEdit.associationsHint") }}</p>
            <p v-if="!editorConfigDraft.associations.length" class="muted settings-note">{{ t("sftpEdit.noAssociations") }}</p>
            <ul v-else class="settings-list">
              <li v-for="(assoc, index) in editorConfigDraft.associations" :key="`${assoc.pattern}-${index}`">
                <div class="settings-list-main">
                  <strong class="mono">{{ assoc.pattern }}</strong>
                  <span class="muted">→ {{ editorTargetName(associationTargetValue(assoc)) }}</span>
                </div>
                <span class="settings-list-actions">
                  <button type="button" class="icon-button" :title="t('delete')" @click="removeEditorAssociation(index)"><Trash2 /></button>
                </span>
              </li>
            </ul>
            <div class="settings-assoc-add">
              <input v-model="editorAssociationPatternDraft" class="mono" spellcheck="false" :placeholder="t('sftpEdit.associationPatternPlaceholder')" />
              <Select :model-value="editorAssociationTargetDraft || SELECT_EMPTY_SENTINEL" @update:model-value="(v) => (editorAssociationTargetDraft = v === SELECT_EMPTY_SENTINEL ? '' : String(v))">
                <SelectTrigger size="xs"><SelectValue :placeholder="t('sftpEdit.associationTargetPlaceholder')" /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="SELECT_EMPTY_SENTINEL">{{ t("sftpEdit.associationTargetPlaceholder") }}</SelectItem>
                  <SelectItem v-for="opt in editorTargetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                </SelectContent>
              </Select>
              <button type="button" class="settings-secondary-button" :disabled="!editorAssociationPatternDraft.trim() || !editorAssociationTargetDraft" @click="addEditorAssociation"><Plus />{{ t("sftpEdit.addAssociation") }}</button>
            </div>
            <h3 class="settings-card-title">{{ t("sftpEdit.customEditorsTitle") }}</h3>
            <p v-if="!editorConfigDraft.customEditors.length" class="muted settings-note">{{ t("sftpEdit.noCustomEditors") }}</p>
            <div v-for="editor in editorConfigDraft.customEditors" :key="editor.id" class="flex items-center gap-2 py-0.5">
              <strong>{{ editor.name }}</strong>
              <code class="mono muted" :title="editor.command">{{ editor.command }}</code>
              <button type="button" class="icon-button" :title="t('delete')" @click="removeCustomEditor(editor.id)"><Trash2 /></button>
            </div>
            </section>
            </div>

            <div v-show="!settingsSearching && settingsCategory === 'terminal'" class="settings-pane">
            <section class="settings-card" data-settings-anchor="scheme">
            <h3 class="settings-card-title">{{ t("terminalAppearance.schemeSection") }}</h3>
            <p class="muted settings-note">{{ t("terminalAppearance.schemeHint") }}</p>
            <div class="scheme-presets scheme-presets--swatches" role="group" :aria-label="t('terminalAppearance.presetsLabel')">
              <button
                v-for="preset in quickPresets"
                :key="preset.id"
                type="button"
                class="scheme-preset-card"
                :class="{ active: isPresetActive(preset) }"
                @click="applyAppearancePreset(preset)"
              >
                <span class="scheme-swatch-row" aria-hidden="true">
                  <span
                    v-for="(color, index) in presetSwatches(preset)"
                    :key="`${preset.id}-${index}`"
                    class="scheme-swatch"
                    :style="{ background: color }"
                  />
                </span>
                <span class="scheme-preset-name">{{ t(`terminalAppearance.${preset.name}`) }}</span>
              </button>
            </div>
            <div class="settings-field">
              <span>{{ t("terminalAppearance.sourceLabel") }}</span>
              <div class="settings-segmented" role="radiogroup" :aria-label="t('terminalAppearance.sourceLabel')">
                <button
                  type="button"
                  class="settings-segment"
                  role="radio"
                  :aria-checked="terminalAppearance.settings.schemeSource === 'host'"
                  :class="{ active: terminalAppearance.settings.schemeSource === 'host' }"
                  @click="patchTerminalAppearance({ schemeSource: 'host' })"
                >{{ t("terminalAppearance.modeFollowHost") }}</button>
                <button
                  type="button"
                  class="settings-segment"
                  role="radio"
                  :aria-checked="terminalAppearance.settings.schemeSource === 'custom'"
                  :class="{ active: terminalAppearance.settings.schemeSource === 'custom' }"
                  @click="onSchemeSourceCustom"
                >{{ t("terminalAppearance.modeCustom") }}</button>
              </div>
            </div>
            <template v-if="terminalAppearance.settings.schemeSource === 'custom'">
              <p class="muted settings-note">{{ t("terminalAppearance.activeSlotHint", { mode: t(hostColorScheme === 'dark' ? 'terminalAppearance.toneDark' : 'terminalAppearance.toneLight') }) }}</p>
              <button
                type="button"
                class="settings-disclosure"
                :aria-expanded="schemeBrowserOpen"
                @click="schemeBrowserOpen = !schemeBrowserOpen"
              >{{ schemeBrowserOpen ? t("terminalAppearance.hideBrowser") : t("terminalAppearance.showBrowser") }}</button>
              <div v-show="schemeBrowserOpen" class="scheme-browser">
                <TerminalSchemePicker
                  :dark-scheme-id="terminalAppearance.settings.darkSchemeId"
                  :light-scheme-id="terminalAppearance.settings.lightSchemeId"
                  :custom-schemes="terminalAppearance.customSchemes"
                  :schemes="schemeCatalog"
                  :host-color-scheme="hostColorScheme"
                  :host-follow-label="t('terminalAppearance.modeFollowHost')"
                  :t="t"
                  @pick="onSchemePick"
                  @create="openSchemeCreate"
                  @import="schemeImportOpen = true"
                  @edit="openSchemeEdit"
                  @delete="deleteCustomScheme"
                />
              </div>
              <div class="settings-field">
                <span>{{ t("terminalAppearance.backgroundSection") }}</span>
                <label class="settings-radio-row">
                  <input
                    type="radio"
                    name="terminal-background-source"
                    value="scheme"
                    :checked="terminalAppearance.settings.backgroundSource === 'scheme'"
                    @change="patchTerminalAppearance({ backgroundSource: 'scheme' })"
                  />
                  <span>{{ t("terminalAppearance.backgroundScheme") }}</span>
                </label>
                <label class="settings-radio-row">
                  <input
                    type="radio"
                    name="terminal-background-source"
                    value="host"
                    :checked="terminalAppearance.settings.backgroundSource === 'host'"
                    @change="patchTerminalAppearance({ backgroundSource: 'host' })"
                  />
                  <span>{{ t("terminalAppearance.backgroundHost") }}</span>
                </label>
                <p class="muted settings-note">{{ t("terminalAppearance.backgroundHint") }}</p>
              </div>
              <div class="settings-pref" data-settings-anchor="bg-image">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("terminalBgImage.section") }}</span>
                  <span class="settings-pref-hint">{{ terminalBgImage.name || t("terminalBgImage.hint") }}</span>
                </div>
                <div class="settings-pref-control settings-pref-control--pair">
                  <label class="settings-secondary-button">
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="onTerminalBgFileChange" />
                    {{ terminalBgImage.dataUrl ? t("terminalBgImage.replace") : t("terminalBgImage.choose") }}
                  </label>
                  <button
                    v-if="terminalBgImage.dataUrl"
                    type="button"
                    class="settings-secondary-button"
                    @click="emit('clear-terminal-bg-image')"
                  >{{ t("terminalBgImage.clear") }}</button>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("terminalBgImage.strength") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Select
                    :model-value="terminalBgImage.strength"
                    :disabled="!terminalBgImage.dataUrl"
                    @update:model-value="(value) => patchTerminalBgStrength(String(value) as TerminalBgStrength)"
                  >
                    <SelectTrigger class="settings-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="subtle">{{ t("terminalBgImage.strength.subtle") }}</SelectItem>
                      <SelectItem value="medium">{{ t("terminalBgImage.strength.medium") }}</SelectItem>
                      <SelectItem value="strong">{{ t("terminalBgImage.strength.strong") }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </template>
            </section>

            <section class="settings-card" data-settings-anchor="preview">
              <h3 class="settings-card-title">{{ t("terminalPreview.section") }}</h3>
              <p class="muted settings-note">{{ t("terminalPreview.hint") }}</p>
              <TerminalPreviewCard
                :settings="terminalAppearance.settings"
                :custom-schemes="terminalAppearance.customSchemes"
                :host-color-scheme="hostColorScheme"
                :font-family="previewFontFamily"
                :font-size="previewFontSize"
                :t="t"
              />
              <button type="button" class="settings-secondary-button settings-reset-button" @click="resetTerminalAppearance">
                <RotateCcw />{{ t("terminalAppearance.reset") }}
              </button>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="webgl">{{ t("terminalAppearance.renderingSection") }}</h3>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("webglLabel") }}</span>
                <span class="settings-pref-hint">{{ t("webglHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch size="sm" :model-value="webglEnabled" @update:model-value="(value) => emit('update:webgl', value === true)" />
              </div>
            </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="layout">{{ t("terminalLayout.section") }}</h3>
            <p class="muted settings-note">{{ t("terminalLayout.hint") }}</p>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalSplit.orientationLabel") }}</span>
                <span class="settings-pref-hint">{{ t("terminalSplit.orientationHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <div class="settings-segmented" role="radiogroup" :aria-label="t('terminalSplit.orientationLabel')">
                  <button
                    type="button"
                    class="settings-segment"
                    role="radio"
                    :aria-checked="splitOrientation === 'vertical'"
                    :class="{ active: splitOrientation === 'vertical' }"
                    @click="emit('update:splitOrientation', 'vertical')"
                  >{{ t("terminalSplit.sideBySide") }}</button>
                  <button
                    type="button"
                    class="settings-segment"
                    role="radio"
                    :aria-checked="splitOrientation === 'horizontal'"
                    :class="{ active: splitOrientation === 'horizontal' }"
                    @click="emit('update:splitOrientation', 'horizontal')"
                  >{{ t("terminalSplit.stack") }}</button>
                </div>
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalSplit.syncDefault") }}</span>
                <span class="settings-pref-hint">{{ t("terminalSplit.syncDefaultHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="syncInputEnabled"
                  @update:model-value="(value) => emit('update:syncInputEnabled', value === true)"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("sftpPane.defaultOpen") }}</span>
                <span class="settings-pref-hint">{{ t("sftpPane.defaultOpenHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="sftpPaneDefaultOpen"
                  @update:model-value="(value) => emit('update:sftpPaneDefaultOpen', value === true)"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("rightRail.label") }}</span>
                <span class="settings-pref-hint">{{ t("rightRail.settingsHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="props.rightRailOpen"
                  @update:model-value="(value) => emit('update:rightRailOpen', value === true)"
                />
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="rail-items">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("rightRail.customize") }}</span>
                <span class="settings-pref-hint">{{
                  rightToolRailPrefs.hidden.length
                    ? t("rightRail.hiddenFmt", { count: rightToolRailPrefs.hidden.length })
                    : t("rightRail.customizeHint")
                }}</span>
              </div>
              <div class="settings-pref-control">
                <button type="button" class="settings-secondary-button" @click="openManage('rail')">{{ t("settingsManage") }}</button>
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("resourceStrip.label") }}</span>
                <span class="settings-pref-hint">{{ t("resourceStrip.settingsHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="resourceStripEnabled"
                  @update:model-value="(value) => emit('update:resourceStrip', value === true)"
                />
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="follow">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("followTerminal") }}</span>
                <span class="settings-pref-hint">{{ t("followTerminalHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="followDirectory"
                  :disabled="followDirectoryDisabled === true"
                  @update:model-value="(value) => emit('update:followDirectory', value === true)"
                />
              </div>
            </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="highlight">{{ t("highlightRules.title") }}</h3>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("highlightRules.enabled") }}</span>
                <span class="settings-pref-hint">{{ t("highlightRules.settingsHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="highlightEnabled"
                  @update:model-value="(value) => emit('update:highlightEnabled', value === true)"
                />
              </div>
            </div>
            <!-- Motty paintHighlightSettings: toggle + actionRows only; forms live in dialogs. -->
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("highlightRules.custom") }}</span>
                <span class="settings-pref-hint">{{ t("highlightRules.countFmt", { count: highlightRules.length }) }}</span>
              </div>
              <div class="settings-pref-control">
                <button type="button" class="settings-secondary-button" @click="openHighlightManage">{{ t("highlightRules.manage") }}</button>
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("highlightRules.add") }}</span>
                <span class="settings-pref-hint">{{ t("highlightRules.customHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <button type="button" class="settings-secondary-button" :disabled="highlightRules.length >= HIGHLIGHT_RULES_LIMIT" @click="openHighlightCreate(false)">{{ t("highlightRules.add") }}</button>
              </div>
            </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="interaction">{{ t("interactionPrefs.section") }}</h3>
            <div class="settings-pref" data-settings-anchor="command-hints">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.commandHints") }}</span>
                <span class="settings-pref-hint">{{ t("interactionPrefs.commandHintsHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="interactionPrefs.commandHintsEnabled"
                  @update:model-value="(value) => emit('update:interactionPrefs', { commandHintsEnabled: value === true })"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalSelectCopy.label") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch size="sm" :model-value="termSelectCopy" @update:model-value="emit('toggle-select-copy')" />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalClickCursor.label") }}</span>
                <span class="settings-pref-hint">{{ t("terminalClickCursor.hint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch size="sm" :model-value="termClickCursor" @update:model-value="emit('toggle-click-cursor')" />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.historyEnabled") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="interactionPrefs.historyEnabled"
                  @update:model-value="(value) => emit('update:interactionPrefs', { historyEnabled: value === true })"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.historyEnterRuns") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="interactionPrefs.historyEnterRuns"
                  :disabled="!interactionPrefs.historyEnabled"
                  @update:model-value="(value) => emit('update:interactionPrefs', { historyEnterRuns: value === true })"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.historyLimit") }}</span>
              </div>
              <div class="settings-pref-control">
                <input
                  type="number"
                  min="20"
                  max="200"
                  step="10"
                  class="mono settings-input-narrow"
                  :value="interactionPrefs.historyLimit"
                  :disabled="!interactionPrefs.historyEnabled"
                  @change="emit('update:interactionPrefs', { historyLimit: Number(($event.target as HTMLInputElement).value) })"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.historyScope") }}</span>
              </div>
              <div class="settings-pref-control">
                <Select
                  :model-value="interactionPrefs.historyScope"
                  :disabled="!interactionPrefs.historyEnabled"
                  @update:model-value="(v) => emit('update:interactionPrefs', { historyScope: String(v) === 'connection' ? 'connection' : 'global' })"
                >
                  <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">{{ t("interactionPrefs.historyScope.global") }}</SelectItem>
                    <SelectItem value="connection">{{ t("interactionPrefs.historyScope.connection") }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="fig-catalog">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("figCatalog.title") }}</span>
                <span class="settings-pref-hint">{{ figCatalogStatus }}</span>
                <span v-if="figCatalogMessage" class="settings-pref-hint">{{ figCatalogMessage }}</span>
              </div>
              <div class="settings-pref-control settings-pref-control--pair">
                <button
                  type="button"
                  class="settings-secondary-button"
                  :disabled="figCatalogBusy"
                  @click="emit('check-fig-catalog')"
                >{{ figCatalogBusy ? t("figCatalog.checking") : t("figCatalog.check") }}</button>
                <button
                  v-if="figCatalogHasOverlay"
                  type="button"
                  class="settings-secondary-button"
                  :disabled="figCatalogBusy"
                  @click="emit('clear-fig-catalog')"
                >{{ t("figCatalog.clear") }}</button>
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="completion-mode">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.completionMode") }}</span>
                <span class="settings-pref-hint">{{ t("interactionPrefs.completionModeHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <div class="settings-segmented" role="radiogroup" :aria-label="t('interactionPrefs.completionMode')">
                  <button
                    v-for="mode in COMPLETION_MODES"
                    :key="mode"
                    type="button"
                    class="settings-segment"
                    role="radio"
                    :aria-checked="interactionPrefs.completionMode === mode"
                    :class="{ active: interactionPrefs.completionMode === mode }"
                    @click="emit('update:interactionPrefs', { completionMode: mode as CompletionMode })"
                  >{{ t(`interactionPrefs.completionMode.${mode}`) }}</button>
                </div>
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.acceptKeyHint") }}</span>
                <span class="settings-pref-hint">{{ t("interactionPrefs.acceptKeyHintHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="interactionPrefs.acceptKeyHintEnabled"
                  :disabled="interactionPrefs.completionMode === 'hotkey'"
                  @update:model-value="(value) => emit('update:interactionPrefs', { acceptKeyHintEnabled: value === true })"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.acceptSuggestionKey") }}</span>
              </div>
              <div class="settings-pref-control">
                <Select
                  :model-value="interactionPrefs.acceptSuggestionKey"
                  :disabled="interactionPrefs.completionMode === 'hotkey'"
                  @update:model-value="(v) => emit('update:interactionPrefs', { acceptSuggestionKey: String(v) as AcceptSuggestionKey })"
                >
                  <SelectTrigger class="settings-select-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="key in ACCEPT_SUGGESTION_KEYS"
                      :key="key"
                      :value="key"
                    >{{ t(`interactionPrefs.acceptSuggestionKey.${key}`) }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.noWrap") }}</span>
                <span class="settings-pref-hint">{{ t("interactionPrefs.noWrapHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="interactionPrefs.noWrap"
                  @update:model-value="(value) => emit('update:interactionPrefs', { noWrap: value === true })"
                />
              </div>
            </div>
            <div v-if="interactionPrefs.noWrap" class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.noWrapColumns") }}</span>
              </div>
              <div class="settings-pref-control">
                <input
                  type="number"
                  class="settings-input-narrow mono"
                  :min="NOWRAP_COLUMNS_MIN"
                  :max="NOWRAP_COLUMNS_MAX"
                  step="50"
                  :value="interactionPrefs.noWrapColumns"
                  @change="emit('update:interactionPrefs', { noWrapColumns: Number(($event.target as HTMLInputElement).value) })"
                />
              </div>
            </div>
            </section>

            <section class="settings-card" data-settings-anchor="session-prefs">
              <h3 class="settings-card-title">{{ t("sessionPrefs.section") }}</h3>
              <p class="muted settings-note">{{ t("sessionPrefs.sectionHint") }}</p>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.osc52") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.osc52Hint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <div class="settings-segmented" role="radiogroup" :aria-label="t('sessionPrefs.osc52')">
                    <button
                      v-for="policy in (['allow', 'ask', 'block'] as Osc52ClipboardPolicy[])"
                      :key="policy"
                      type="button"
                      class="settings-segment"
                      role="radio"
                      :aria-checked="sessionPrefs.osc52Policy === policy"
                      :class="{ active: sessionPrefs.osc52Policy === policy }"
                      @click="patchSessionPrefs({ osc52Policy: policy })"
                    >{{ t(`sessionPrefs.osc52.${policy}`) }}</button>
                  </div>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.scrollback") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.scrollbackHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Select
                    :model-value="String(sessionPrefs.scrollback)"
                    @update:model-value="(value) => patchSessionPrefs({ scrollback: Number(value) as TerminalScrollbackLines })"
                  >
                    <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="lines in SCROLLBACK_CHOICES" :key="lines" :value="String(lines)">{{ lines }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.wordSeparators") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.wordSeparatorsHint") }}</span>
                </div>
                <div class="settings-pref-control settings-pref-control--pair">
                  <input
                    class="mono settings-input"
                    spellcheck="false"
                    :value="sessionPrefs.wordSeparators"
                    :placeholder="DEFAULT_WORD_SEPARATORS"
                    @change="patchSessionPrefs({ wordSeparators: ($event.target as HTMLInputElement).value })"
                  />
                  <button type="button" class="settings-secondary-button" @click="patchSessionPrefs({ wordSeparators: '' })">{{ t("sessionPrefs.wordSeparatorsReset") }}</button>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.tabTitle") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.tabTitleHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Select
                    :model-value="sessionPrefs.tabTitleMode"
                    @update:model-value="(value) => patchSessionPrefs({ tabTitleMode: String(value) as TabTitleMode })"
                  >
                    <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="connection">{{ t("sessionPrefs.tabTitle.connection") }}</SelectItem>
                      <SelectItem value="terminal">{{ t("sessionPrefs.tabTitle.terminal") }}</SelectItem>
                      <SelectItem value="directory">{{ t("sessionPrefs.tabTitle.directory") }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.showLatency") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.showLatencyHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="sessionPrefs.showLatency" @update:model-value="(value) => patchSessionPrefs({ showLatency: value === true })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.bell") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.bellHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="sessionPrefs.bellEnabled" @update:model-value="(value) => patchSessionPrefs({ bellEnabled: value === true })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.notifications") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.notificationsHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="sessionPrefs.notificationsEnabled" @update:model-value="(value) => patchSessionPrefs({ notificationsEnabled: value === true })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.passwordHint") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.passwordHintHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="sessionPrefs.passwordHintEnabled" @update:model-value="(value) => patchSessionPrefs({ passwordHintEnabled: value === true })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.pasteImage") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.pasteImageHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="sessionPrefs.pasteImageEnabled" @update:model-value="(value) => patchSessionPrefs({ pasteImageEnabled: value === true })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.gutter") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.gutterHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Select
                    :model-value="sessionPrefs.gutter"
                    @update:model-value="(value) => patchSessionPrefs({ gutter: String(value) as 'off' | 'numbers' | 'time' | 'both' })"
                  >
                    <SelectTrigger class="settings-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">{{ t("sessionPrefs.gutter.off") }}</SelectItem>
                      <SelectItem value="numbers">{{ t("sessionPrefs.gutter.numbers") }}</SelectItem>
                      <SelectItem value="time">{{ t("sessionPrefs.gutter.time") }}</SelectItem>
                      <SelectItem value="both">{{ t("sessionPrefs.gutter.both") }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.closeSessionConfirm") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.closeSessionConfirmHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="sessionPrefs.closeSessionConfirm" @update:model-value="(value) => patchSessionPrefs({ closeSessionConfirm: value === true })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.closeWorkbenchConfirm") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.closeWorkbenchConfirmHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="sessionPrefs.closeWorkbenchConfirm" @update:model-value="(value) => patchSessionPrefs({ closeWorkbenchConfirm: value === true })" />
                </div>
              </div>
            </section>

            <section class="settings-card" data-settings-anchor="find-prefs">
              <h3 class="settings-card-title">{{ t("sessionPrefs.findSection") }}</h3>
              <p class="muted settings-note">{{ t("sessionPrefs.findHint") }}</p>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.findForeground") }}</span>
                </div>
                <div class="settings-pref-control">
                  <input type="color" class="settings-color" :value="sessionPrefs.find.foreground" @input="patchSessionPrefs({ find: { ...sessionPrefs.find, foreground: ($event.target as HTMLInputElement).value } })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.findBackground") }}</span>
                </div>
                <div class="settings-pref-control">
                  <input type="color" class="settings-color" :value="sessionPrefs.find.background" @input="patchSessionPrefs({ find: { ...sessionPrefs.find, background: ($event.target as HTMLInputElement).value } })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.findOpacity") }}</span>
                </div>
                <div class="settings-pref-control">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    class="mono settings-input-narrow"
                    :value="sessionPrefs.find.opacity"
                    @change="patchSessionPrefs({ find: { ...sessionPrefs.find, opacity: Number(($event.target as HTMLInputElement).value) } })"
                  />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("sessionPrefs.findOrigin") }}</span>
                  <span class="settings-pref-hint">{{ t("sessionPrefs.findOriginHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Select
                    :model-value="sessionPrefs.find.origin"
                    @update:model-value="(value) => patchSessionPrefs({ find: { ...sessionPrefs.find, origin: String(value) as TerminalFindOrigin } })"
                  >
                    <SelectTrigger class="settings-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="origin in FIND_ORIGIN_CHOICES" :key="origin" :value="origin">
                        {{ t(`sessionPrefs.findOrigin.${origin}`) }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section class="settings-card" data-settings-anchor="autofill">
              <h3 class="settings-card-title">{{ t("autofillRules.title") }}</h3>
              <p class="muted settings-note">{{ t("autofillRules.settingsHint") }}</p>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("settingsList") }}</span>
                  <span class="settings-pref-hint">{{ t("autofillRules.limit", { count: autofillRules.length, limit: AUTOFILL_RULES_LIMIT }) }}</span>
                </div>
                <div class="settings-pref-control">
                  <button type="button" class="settings-secondary-button" @click="openManage('autofill')">{{ t("autofillRules.manage") }}</button>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("autofillRules.add") }}</span>
                  <span class="settings-pref-hint">{{ t("autofillRules.addHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <button type="button" class="settings-secondary-button" :disabled="autofillRules.length >= AUTOFILL_RULES_LIMIT" @click="openAutofillCreate">{{ t("autofillRules.add") }}</button>
                </div>
              </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="startup">{{ t("startupCommands.title") }}</h3>
            <template v-if="connectionId">
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("startupCommands.enabled") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="startupBucket.enabled" @update:model-value="(value) => (startupBucket = { ...startupBucket, enabled: value === true })" />
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("settingsList") }}</span>
                  <span class="settings-pref-hint">{{ t("startupCommands.limit", { count: startupBucket.commands.length, limit: STARTUP_COMMANDS_LIMIT }) }}</span>
                </div>
                <div class="settings-pref-control">
                  <button type="button" class="settings-secondary-button" @click="openManage('startup')">{{ t("settingsManage") }}</button>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("startupCommands.add") }}</span>
                  <span class="settings-pref-hint">{{ t("startupCommands.addHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <button type="button" class="settings-secondary-button" :disabled="!canAddStartupCommand(startupBucket)" @click="openStartupEditor()">{{ t("startupCommands.add") }}</button>
                </div>
              </div>
            </template>
            <p v-else class="muted settings-note">{{ t("startupCommands.needsConnection") }}</p>
            </section>

            <section class="settings-card settings-card--quick-commands" data-settings-anchor="quick-commands">
              <h3 class="settings-card-title">{{ t("quickCommands") }}</h3>
              <p class="muted settings-note">{{ t("quickCommands.settingsHint") }}</p>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("settingsList") }}</span>
                  <span class="settings-pref-hint">{{ t("quickCommands.limitScope", { count: quickCommandCount ?? 0, limit: QUICK_COMMANDS_LIMIT }) }}</span>
                </div>
                <div class="settings-pref-control">
                  <button type="button" class="settings-secondary-button" @click="openManage('quick')">{{ t("settingsManage") }}</button>
                </div>
              </div>
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("quickCommandsNew") }}</span>
                  <span class="settings-pref-hint">{{ t("quickCommands.addHint") }}</span>
                </div>
                <div class="settings-pref-control">
                  <button type="button" class="settings-secondary-button" :disabled="!canAddQuickCommand" @click="openQuickAdd">{{ t("quickCommandsNew") }}</button>
                </div>
              </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="font">{{ t("terminalFont.title") }}</h3>
            <label class="settings-field">
              <span>{{ t("terminalFont.family") }}</span>
              <Select :model-value="terminalFontFamilyChoice" @update:model-value="(v) => onTerminalFontFamilyChoice(String(v))">
                <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="TERMINAL_FONT_FOLLOW_HOST">{{ t("terminalFont.followHost") }}</SelectItem>
                  <SelectItem v-for="preset in TERMINAL_FONT_PRESETS" :key="preset.value" :value="preset.value" class="terminal-font-option" :style="{ fontFamily: preset.value }">{{ preset.label }}</SelectItem>
                  <SelectItem :value="TERMINAL_FONT_CUSTOM">{{ t("terminalFont.custom") }}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label v-if="terminalFontFamilyChoice === TERMINAL_FONT_CUSTOM" class="settings-field">
              <span>{{ t("terminalFont.custom") }}</span>
              <input v-model="terminalFontCustomDraft" class="mono" spellcheck="false" :placeholder="t('terminalFont.customPlaceholder')" @change="applyTerminalFontFromControls" />
            </label>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalFont.size") }}</span>
                <span class="settings-pref-hint">{{ t("terminalFont.ligaturesUnavailable") }}</span>
              </div>
              <div class="settings-pref-control settings-pref-control--stepper">
                <button type="button" class="settings-stepper-btn" :disabled="Number(terminalFontSizeDraft) <= TERMINAL_FONT_MIN" :aria-label="t('terminalFontDecrease')" @click="bumpTerminalFontSize(-1)">−</button>
                <button type="button" class="settings-stepper-value" @click="resetTerminalFont" :title="t('terminalFont.reset')">{{ terminalFontSizeDraft }}</button>
                <button type="button" class="settings-stepper-btn" :disabled="Number(terminalFontSizeDraft) >= TERMINAL_FONT_MAX" :aria-label="t('terminalFontIncrease')" @click="bumpTerminalFontSize(1)">+</button>
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="font-weight">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalFont.weight") }}</span>
                <span class="settings-pref-hint">{{ t("terminalFont.weightHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <div class="settings-segmented" role="radiogroup" :aria-label="t('terminalFont.weight')">
                  <button
                    v-for="weight in TERMINAL_FONT_WEIGHTS"
                    :key="weight.value"
                    type="button"
                    class="settings-segment"
                    role="radio"
                    :aria-checked="(terminalAppearance.settings.fontWeight ?? 400) === weight.value"
                    :class="{ active: (terminalAppearance.settings.fontWeight ?? 400) === weight.value }"
                    @click="patchTerminalAppearance({ fontWeight: weight.value })"
                  >{{ t(weight.labelKey) }}</button>
                </div>
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="font-weight-bold">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalFont.weightBold") }}</span>
                <span class="settings-pref-hint">{{ t("terminalFont.weightBoldHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <div class="settings-segmented" role="radiogroup" :aria-label="t('terminalFont.weightBold')">
                  <button
                    v-for="weight in TERMINAL_FONT_WEIGHTS"
                    :key="`bold-${weight.value}`"
                    type="button"
                    class="settings-segment"
                    role="radio"
                    :aria-checked="(terminalAppearance.settings.fontWeightBold ?? 700) === weight.value"
                    :class="{ active: (terminalAppearance.settings.fontWeightBold ?? 700) === weight.value }"
                    @click="patchTerminalAppearance({ fontWeightBold: weight.value })"
                  >{{ t(weight.labelKey) }}</button>
                </div>
              </div>
            </div>
            <div class="settings-field">
              <span>{{ t("terminalFont.fallbacks") }}</span>
              <p class="muted settings-note">{{ t("terminalFont.fallbacksHint") }}</p>
              <ul v-if="terminalAppearance.settings.fontFallbacks.length" class="settings-list">
                <li v-for="(family, index) in terminalAppearance.settings.fontFallbacks" :key="`${family}-${index}`">
                  <div class="settings-list-main">
                    <strong class="mono">{{ family }}</strong>
                  </div>
                  <span class="settings-list-actions">
                    <button type="button" class="icon-button" :title="t('delete')" @click="removeFontFallback(index)"><Trash2 /></button>
                  </span>
                </li>
              </ul>
              <div class="settings-assoc-add settings-assoc-add--flush">
                <input
                  v-model="fontFallbackDraft"
                  class="mono"
                  spellcheck="false"
                  :placeholder="t('terminalFont.fallbacksPlaceholder')"
                  :disabled="terminalAppearance.settings.fontFallbacks.length >= FONT_FALLBACK_LIMIT"
                  @keydown.enter.prevent="addFontFallback"
                />
                <button
                  type="button"
                  class="settings-secondary-button"
                  :disabled="!fontFallbackDraft.trim() || terminalAppearance.settings.fontFallbacks.length >= FONT_FALLBACK_LIMIT"
                  @click="addFontFallback"
                >{{ t("terminalFont.fallbacksAdd") }}</button>
              </div>
            </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title" data-settings-anchor="display">{{ t("terminalDisplay.section") }}</h3>
            <p class="muted settings-note">{{ t("terminalDisplay.hint") }}</p>
            <div class="settings-pref" data-settings-anchor="display-cursor">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalDisplay.cursorStyle") }}</span>
              </div>
              <div class="settings-pref-control">
                <div class="settings-segmented" role="radiogroup" :aria-label="t('terminalDisplay.cursorStyle')">
                  <button
                    v-for="style in (['bar', 'block', 'underline'] as const)"
                    :key="style"
                    type="button"
                    class="settings-segment"
                    role="radio"
                    :aria-checked="terminalAppearance.settings.cursorStyle === style"
                    :class="{ active: terminalAppearance.settings.cursorStyle === style }"
                    @click="patchTerminalAppearance({ cursorStyle: style })"
                  >{{ t(`terminalDisplay.cursor.${style}`) }}</button>
                </div>
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalDisplay.cursorBlink") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="terminalAppearance.settings.cursorBlink"
                  @update:model-value="(value) => patchTerminalAppearance({ cursorBlink: value === true })"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalDisplay.cursorThickness") }}</span>
                <span class="settings-pref-hint">{{ t("terminalDisplay.cursorThicknessHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <div class="settings-segmented" role="radiogroup" :aria-label="t('terminalDisplay.cursorThickness')">
                  <button
                    v-for="thickness in (['thin', 'normal', 'thick'] as TerminalCursorThickness[])"
                    :key="thickness"
                    type="button"
                    class="settings-segment"
                    role="radio"
                    :aria-checked="terminalAppearance.settings.cursorThickness === thickness"
                    :class="{ active: terminalAppearance.settings.cursorThickness === thickness }"
                    @click="patchTerminalAppearance({ cursorThickness: thickness })"
                  >{{ t(`terminalDisplay.thickness.${thickness}`) }}</button>
                </div>
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="display-intense">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalDisplay.intense") }}</span>
                <span class="settings-pref-hint">{{ t("terminalDisplay.intenseHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Select
                  :model-value="terminalAppearance.settings.intenseMode"
                  @update:model-value="(value) => patchTerminalAppearance({ intenseMode: String(value) as TerminalIntenseMode })"
                >
                  <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{{ t("terminalDisplay.intense.both") }}</SelectItem>
                    <SelectItem value="bright">{{ t("terminalDisplay.intense.bright") }}</SelectItem>
                    <SelectItem value="bold">{{ t("terminalDisplay.intense.bold") }}</SelectItem>
                    <SelectItem value="plain">{{ t("terminalDisplay.intense.plain") }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="display-line-height">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalDisplay.lineHeight") }}</span>
                <span class="settings-pref-hint">{{ t("terminalDisplay.lineHeightHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <input
                  type="number"
                  min="1"
                  max="3"
                  step="0.05"
                  class="mono settings-input-narrow"
                  :value="terminalAppearance.settings.lineHeight ?? 1.15"
                  @change="patchTerminalAppearance({ lineHeight: Number(($event.target as HTMLInputElement).value) || 1.15 })"
                />
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="display-letter-spacing">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalDisplay.letterSpacing") }}</span>
              </div>
              <div class="settings-pref-control">
                <input
                  type="number"
                  min="-5"
                  max="10"
                  step="1"
                  class="mono settings-input-narrow"
                  :value="terminalAppearance.settings.letterSpacing ?? 0"
                  @change="patchTerminalAppearance({ letterSpacing: Number(($event.target as HTMLInputElement).value) || 0 })"
                />
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="display-padding">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalDisplay.padding") }}</span>
                <span class="settings-pref-hint">{{ t("terminalDisplay.paddingHint") }}</span>
              </div>
              <div class="settings-pref-control settings-pref-control--pair">
                <label class="settings-inline-field">
                  <span>{{ t("terminalDisplay.paddingX") }}</span>
                  <input
                    type="number"
                    min="0"
                    max="32"
                    step="1"
                    class="mono settings-input-narrow"
                    :value="terminalAppearance.settings.paddingX ?? 10"
                    @change="patchTerminalAppearance({ paddingX: Number(($event.target as HTMLInputElement).value) || 0 })"
                  />
                </label>
                <label class="settings-inline-field">
                  <span>{{ t("terminalDisplay.paddingY") }}</span>
                  <input
                    type="number"
                    min="0"
                    max="32"
                    step="1"
                    class="mono settings-input-narrow"
                    :value="terminalAppearance.settings.paddingY ?? 8"
                    @change="patchTerminalAppearance({ paddingY: Number(($event.target as HTMLInputElement).value) || 0 })"
                  />
                </label>
              </div>
            </div>
            <div class="settings-pref" data-settings-anchor="display-contrast">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("terminalDisplay.contrast") }}</span>
                <span class="settings-pref-hint">{{ t("terminalDisplay.contrastHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <input
                  type="number"
                  min="1"
                  max="21"
                  step="1"
                  class="mono settings-input-narrow"
                  :value="terminalAppearance.settings.minimumContrastRatio"
                  @change="patchTerminalAppearance({ minimumContrastRatio: Math.max(1, Math.min(21, Number(($event.target as HTMLInputElement).value) || 1)) })"
                />
              </div>
            </div>
            </section>
            </div>

          <div v-show="!settingsSearching && settingsCategory === 'security'" class="settings-pane">
          <section class="settings-card" data-settings-anchor="known-hosts">
          <h3 class="settings-card-title">{{ t("knownHosts.title") }}</h3>
          <p class="muted settings-note">{{ t(activeCategory.blurbKey) }}</p>
          <div v-if="knownHostsLoading" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
          <p v-else-if="knownHostsError" class="task-error">{{ knownHostsError }} <button class="link-button" @click="loadKnownHosts">{{ t("refresh") }}</button></p>
          <div v-else-if="!knownHosts.length" class="empty compact">{{ t("knownHosts.empty") }}</div>
          <ul v-else class="settings-list">
            <li v-for="(entry, index) in knownHosts" :key="`${entry.host}:${entry.port}:${entry.keyType}:${index}`">
              <div class="settings-list-main">
                <strong class="mono">{{ entry.host }}:{{ entry.port }}</strong>
                <span class="muted">{{ entry.keyType }} · <span class="mono" :title="entry.fingerprint">{{ shortFingerprint(entry.fingerprint) }}</span></span>
              </div>
              <button class="icon-button" :title="t('delete')" @click="removeKnownHost(entry)"><Trash2 /></button>
            </li>
          </ul>
          </section>

          <section class="settings-card">
          <h3 class="settings-card-title" data-settings-anchor="keys">{{ t("keysPanel.title") }}</h3>
          <p class="muted settings-note">{{ t("keysPanel.hint") }}</p>
          <div v-if="localKeysLoading" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
          <p v-else-if="localKeysError" class="task-error">{{ localKeysError }} <button class="link-button" @click="loadLocalKeys">{{ t("refresh") }}</button></p>
          <div v-else-if="!localKeys.length" class="empty compact">{{ t("keysPanel.empty") }}</div>
          <ul v-else class="settings-list">
            <li v-for="key in localKeys" :key="key.path">
              <div class="settings-list-main">
                <strong class="mono" :title="key.path">{{ key.path }}</strong>
                <span class="muted">{{ key.algorithm }} · <span class="mono" :title="key.fingerprint">{{ shortFingerprint(key.fingerprint) }}</span><template v-if="key.hasPassphrase"> · {{ t("keysPanel.hasPassphrase") }}</template></span>
              </div>
              <KeyRound class="settings-key-icon" />
            </li>
          </ul>
          </section>
          </div>

          <div v-show="!settingsSearching && settingsCategory === 'mcp'" class="settings-pane">
          <section class="settings-card" data-settings-anchor="mcp">
          <div v-if="mcpLoading" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
          <template v-else>
            <div class="mcp-limits">
              <label class="settings-field">
                <span>{{ t("mcpLimits.read") }}</span>
                <input v-model="mcpDraft.readMiB" type="number" min="1" step="1" inputmode="numeric" />
              </label>
              <label class="settings-field">
                <span>{{ t("mcpLimits.upload") }}</span>
                <input v-model="mcpDraft.uploadMiB" type="number" min="1" step="1" inputmode="numeric" />
              </label>
              <label class="settings-field">
                <span>{{ t("mcpLimits.download") }}</span>
                <input v-model="mcpDraft.downloadMiB" type="number" min="1" step="1" inputmode="numeric" />
              </label>
            </div>
            <label class="settings-field">
              <span>{{ t("mcpSettings.permissionMode") }}</span>
              <Select :model-value="mcpDraft.permissionMode" @update:model-value="(v) => (mcpDraft.permissionMode = String(v))">
                <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="autonomous">{{ t("mcpSettings.permissionModeAutonomous") }}</SelectItem>
                  <SelectItem value="confirm">{{ t("mcpSettings.permissionModeConfirm") }}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label class="settings-field">
              <span>{{ t("mcpSettings.connectionScope") }}</span>
              <textarea v-model="mcpDraft.connectionScope" rows="3" class="mono" spellcheck="false" :placeholder="t('mcpSettings.connectionScopeHint')" />
            </label>
            <p v-if="!mcpInputsValid" class="task-error">{{ t("mcpLimits.invalid") }}</p>
            <p v-if="mcpError" class="task-error">{{ mcpError }} <button class="link-button" @click="loadMcpSettings">{{ t("refresh") }}</button></p>
            <!-- 独立「保存」链接已并入底部主「保存」串行链（saveSettings）。 -->
          </template>
          </section>
          </div>
            </div>
          </div>

        </div>
        <!-- Motty persists on change with no footer chrome. -->
    </div>

    <!-- Motty: highlight add/edit dialog (no scrim dismiss — don't discard form). -->
    <Dialog :open="highlightEditorOpen" @update:open="(open) => { if (!open) closeHighlightEditor(); }">
      <DialogContent
        class="modal settings-form-modal highlight-rule-modal"
        @escape-key-down.prevent
        @pointer-down-outside.prevent
        @interact-outside.prevent
      >
        <header>
          <DialogTitle>{{ highlightDraft.id ? t("highlightRules.editTitle") : t("highlightRules.addTitle") }}</DialogTitle>
          <button type="button" :title="t('close')" class="icon-button" @click="closeHighlightEditor"><X /></button>
        </header>
        <div class="settings-form-body">
          <label class="settings-field">
            <span>{{ t("highlightRules.dialogPattern") }}</span>
            <input v-model="highlightDraft.pattern" :placeholder="t('highlightRules.patternPlaceholder')" :maxlength="200" spellcheck="false" autofocus @keydown.enter="saveHighlightRule" />
          </label>
          <label class="settings-check-row">
            <input v-model="highlightDraft.isRegex" type="checkbox" />
            <span>{{ t("highlightRules.regex") }}</span>
          </label>
          <label class="settings-check-row">
            <input v-model="highlightDraft.caseSensitive" type="checkbox" />
            <span>{{ t("highlightRules.caseSensitive") }}</span>
          </label>
          <div class="settings-field">
            <span>{{ t("highlightRules.color") }}</span>
            <div class="highlight-palette highlight-palette--chips">
              <button
                v-for="swatch in HIGHLIGHT_PALETTE"
                :key="swatch"
                type="button"
                class="highlight-palette-swatch"
                :class="{ selected: highlightDraft.color.toLowerCase() === swatch }"
                :style="{ backgroundColor: swatch }"
                :aria-label="swatch"
                @click="highlightDraft.color = swatch"
              />
            </div>
          </div>
          <p v-if="highlightDraftError" class="task-error">{{ highlightDraftError }}</p>
        </div>
        <footer>
          <button type="button" @click="closeHighlightEditor">{{ t("cancel") }}</button>
          <button type="button" class="primary-button" :disabled="highlightSaving || !highlightDraft.pattern.trim() || (!highlightDraft.id && highlightRules.length >= HIGHLIGHT_RULES_LIMIT)" @click="saveHighlightRule">
            <Loader2 v-if="highlightSaving" class="spinning" />{{ highlightDraft.id ? t("save") : t("highlightRules.add") }}
          </button>
        </footer>
      </DialogContent>
    </Dialog>

    <!-- Quick commands: own manage dialog, same pattern as keyword-highlight rules. -->
    <SettingsManageModal
      :open="quickManageOpen"
      :title="t('quickCommands')"
      :hint="t('quickCommands.manageHint')"
      :done-label="t('settingsDone')"
      :close-label="t('close')"
      @update:open="(open) => (quickManageOpen = open)"
    >
      <slot name="quick-commands" />
    </SettingsManageModal>

    <!-- Startup commands: per-connection list in a dedicated dialog. -->
    <SettingsManageModal
      :open="startupManageOpen"
      :title="t('startupCommands.title')"
      :hint="t('startupCommands.manageHint')"
      :done-label="t('settingsDone')"
      :close-label="t('close')"
      @update:open="(open) => (startupManageOpen = open)"
    >
      <template v-if="connectionId">
        <p v-if="!startupBucket.commands.length" class="muted settings-note">{{ t("startupCommands.empty") }}</p>
        <ul v-else class="settings-list startup-commands-list">
          <li v-for="(row, index) in startupBucket.commands" :key="index">
            <div class="settings-list-main">
              <strong class="mono" :class="{ 'startup-command-off': !row.enabled }" :title="row.command">{{ row.command }}</strong>
              <span class="muted startup-command-meta">
                <span class="quick-command-scope-badge" :data-scope="row.enabled ? 'connection' : 'global'">{{ row.enabled ? t("startupCommands.rowEnabled") : t("startupCommands.rowDisabled") }}</span>
                {{ t("startupCommands.delayMs") }}: {{ row.delayMs }}ms
              </span>
            </div>
            <div class="settings-list-actions">
              <button type="button" class="icon-button" :title="t('startupCommands.moveUp')" :disabled="index === 0" @click="moveStartupRow(index, -1)">↑</button>
              <button type="button" class="icon-button" :title="t('startupCommands.moveDown')" :disabled="index >= startupBucket.commands.length - 1" @click="moveStartupRow(index, 1)">↓</button>
              <button type="button" class="icon-button" :title="t('startupCommands.edit')" @click="openStartupEditor(index)"><Pencil /></button>
              <button type="button" class="icon-button" :title="t('delete')" @click="removeStartupRow(index)"><Trash2 /></button>
            </div>
          </li>
        </ul>
        <div class="settings-toolbar">
          <span class="settings-toolbar-count muted">{{ t("startupCommands.limit", { count: startupBucket.commands.length, limit: STARTUP_COMMANDS_LIMIT }) }}</span>
        </div>
      </template>
      <p v-else class="muted settings-note">{{ t("startupCommands.needsConnection") }}</p>
    </SettingsManageModal>

    <!-- Assistant models: provider list in a dedicated dialog. -->
    <SettingsManageModal
      :open="modelsManageOpen"
      :title="t('copilot.settingsModels')"
      :hint="t('copilot.settingsFormHint')"
      :done-label="t('settingsDone')"
      :close-label="t('close')"
      @update:open="(open) => (modelsManageOpen = open)"
    >
      <p v-if="!copilotModels.length" class="muted settings-note">{{ t("copilot.settingsEmpty") }}</p>
      <ul v-else class="settings-list copilot-models-list">
        <li
          v-for="row in copilotModels"
          :key="row.id"
          :data-active="row.id === copilotActiveId"
          :data-ready="row.configured"
        >
          <button
            type="button"
            class="copilot-model-active"
            :title="t('copilot.settingsSetActive')"
            :disabled="copilotLlmSaving || row.id === copilotActiveId"
            @click="activateCopilotModel(row.id)"
          >
            <Check v-if="row.id === copilotActiveId" />
            <span v-else class="copilot-model-dot" />
          </button>
          <div class="settings-list-main">
            <strong>{{ row.label }}</strong>
            <span class="muted">{{ copilotModelSummary(row) }}</span>
          </div>
          <span class="settings-list-actions">
            <button class="icon-button" type="button" :title="t('copilot.settingsEdit')" :disabled="copilotLlmSaving" @click="startCopilotModelEdit(row)"><Pencil /></button>
            <button class="icon-button" type="button" :title="t('copilot.settingsDelete')" :disabled="copilotLlmSaving" @click="deleteCopilotModel(row)"><Trash2 /></button>
          </span>
        </li>
      </ul>
    </SettingsManageModal>

    <SettingsManageModal
      :open="railManageOpen"
      :title="t('rightRail.customize')"
      :hint="t('rightRail.customizeHint')"
      :done-label="t('settingsDone')"
      :close-label="t('close')"
      @update:open="(open) => (railManageOpen = open)"
    >
      <ul class="settings-list settings-rail-manage-list">
        <li v-for="(id, index) in rightToolRailPrefs.order" :key="id">
          <div class="settings-list-main">
            <strong :class="{ disabled: rightToolRailPrefs.hidden.includes(id) }">{{ t(rightRailItemLabelKey(id)) }}</strong>
          </div>
          <span class="settings-list-actions">
            <button type="button" class="icon-button" :disabled="index === 0" :title="t('rightRail.moveUp')" @click="moveRightRailItem(id, -1)"><ArrowUp /></button>
            <button type="button" class="icon-button" :disabled="index >= rightToolRailPrefs.order.length - 1" :title="t('rightRail.moveDown')" @click="moveRightRailItem(id, 1)"><ArrowDown /></button>
            <button
              type="button"
              class="icon-button"
              :title="rightToolRailPrefs.hidden.includes(id) ? t('rightRail.showItem') : t('rightRail.hideItem')"
              @click="toggleRightRailHidden(id)"
            >
              <EyeOff v-if="rightToolRailPrefs.hidden.includes(id)" />
              <Eye v-else />
            </button>
          </span>
        </li>
      </ul>
      <template #actions>
        <button type="button" class="settings-secondary-button" @click="resetRightToolRailPrefs">{{ t("rightRail.resetOrder") }}</button>
      </template>
    </SettingsManageModal>

    <!-- Keyword highlight rules: own manage dialog (unchanged behaviour). -->
    <SettingsManageModal
      :open="highlightManageOpen"
      :title="t('highlightRules.title')"
      :hint="t('highlightRules.manageHint')"
      :done-label="t('settingsDone')"
      :close-label="t('close')"
      @update:open="(open) => (highlightManageOpen = open)"
    >
      <p class="muted settings-note">{{ t("highlightRules.limit", { count: highlightRules.length, limit: HIGHLIGHT_RULES_LIMIT }) }}</p>
      <p v-if="!highlightRules.length" class="muted settings-note">{{ t("highlightRules.empty") }}</p>
      <ul v-else class="settings-list highlight-rules-list">
        <li v-for="item in highlightRules" :key="item.id">
          <span class="highlight-color-dot" :style="{ backgroundColor: item.color }" />
          <div class="settings-list-main">
            <strong class="mono" :class="{ disabled: !item.enabled }" :title="item.pattern">{{ item.pattern }}</strong>
            <span class="highlight-rule-badges muted">
              <span v-if="item.isRegex">regex</span>
              <span v-if="item.caseSensitive">Aa</span>
            </span>
          </div>
          <span class="settings-list-actions">
            <Switch size="sm" :model-value="item.enabled" :title="t('highlightRules.enabled')" @update:model-value="() => toggleHighlightRule(item)" />
            <button type="button" class="icon-button" :title="t('quickCommandsEdit')" @click="editHighlightRule(item)"><Pencil /></button>
            <button type="button" class="icon-button" :title="t('delete')" @click="deleteHighlightRule(item.id)"><Trash2 /></button>
          </span>
        </li>
      </ul>
    </SettingsManageModal>

    <SettingsManageModal
      :open="autofillManageOpen"
      :title="t('autofillRules.title')"
      :hint="t('autofillRules.manageHint')"
      :done-label="t('settingsDone')"
      :close-label="t('close')"
      @update:open="(open) => (autofillManageOpen = open)"
    >
      <p class="muted settings-note">{{ t("autofillRules.limit", { count: autofillRules.length, limit: AUTOFILL_RULES_LIMIT }) }}</p>
      <p v-if="!autofillRules.length" class="muted settings-note">{{ t("autofillRules.empty") }}</p>
      <ul v-else class="settings-list">
        <li v-for="item in autofillRules" :key="item.id">
          <div class="settings-list-main">
            <strong :class="{ disabled: !item.enabled }">{{ item.name }}</strong>
            <span class="muted mono" :title="item.pattern">{{ item.pattern }}</span>
          </div>
          <span class="settings-list-actions">
            <Switch size="sm" :model-value="item.enabled" :title="t('autofillRules.enabled')" @update:model-value="() => toggleAutofillRule(item)" />
            <button type="button" class="icon-button" :title="t('quickCommandsEdit')" @click="openAutofillEdit(item)"><Pencil /></button>
            <button type="button" class="icon-button" :title="t('delete')" @click="deleteAutofillRule(item.id)"><Trash2 /></button>
          </span>
        </li>
      </ul>
      <template #actions>
        <button type="button" class="settings-secondary-button" :disabled="autofillRules.length >= AUTOFILL_RULES_LIMIT" @click="openAutofillCreate">{{ t("autofillRules.add") }}</button>
      </template>
    </SettingsManageModal>

    <Dialog :open="autofillEditorOpen" @update:open="(open) => { if (!open) { autofillEditorOpen = false; clearAutofillDraft(); } }">
      <DialogContent class="modal settings-form-modal" @escape-key-down.prevent @pointer-down-outside.prevent>
        <header>
          <DialogTitle>{{ autofillDraft.id ? t("autofillRules.editTitle") : t("autofillRules.addTitle") }}</DialogTitle>
          <button type="button" class="icon-button" :title="t('close')" @click="autofillEditorOpen = false; clearAutofillDraft()"><X /></button>
        </header>
        <label class="settings-form-field">
          <span>{{ t("autofillRules.name") }}</span>
          <input v-model="autofillDraft.name" :maxlength="AUTOFILL_NAME_MAX" spellcheck="false" autofocus />
        </label>
        <label class="settings-form-field">
          <span>{{ t("autofillRules.pattern") }}</span>
          <input v-model="autofillDraft.pattern" class="mono" :placeholder="t('autofillRules.patternPlaceholder')" :maxlength="AUTOFILL_PATTERN_MAX" spellcheck="false" />
        </label>
        <label class="settings-form-field">
          <span>{{ t("autofillRules.fixedText") }}</span>
          <input v-model="autofillDraft.fixedText" class="mono" :maxlength="AUTOFILL_TEXT_MAX" spellcheck="false" />
        </label>
        <label class="settings-form-check">
          <Switch size="sm" :model-value="autofillDraft.appendEnter" @update:model-value="(value) => (autofillDraft.appendEnter = value === true)" />
          <span>{{ t("autofillRules.appendEnter") }}</span>
        </label>
        <p v-if="autofillDraftError" class="settings-form-error">{{ autofillDraftError }}</p>
        <footer>
          <button type="button" @click="autofillEditorOpen = false; clearAutofillDraft()">{{ t("cancel") }}</button>
          <button type="button" class="primary-button" @click="saveAutofillDraft">{{ autofillDraft.id ? t("save") : t("autofillRules.add") }}</button>
        </footer>
      </DialogContent>
    </Dialog>

    <!-- Quick command add form, opened from the settings card. -->
    <QuickCommandEditorDialog
      :open="quickAddOpen"
      :commands="quickCommandList"
      :connection-id="connectionId ?? ''"
      :saving="quickSaving === true"
      :t="t"
      @save="(payload) => emit('quick-command-save', payload)"
      @update:open="(open) => (quickAddOpen = open)"
    />

    <!-- Motty AI provider form: add/edit model in a modal with key privacy hint. -->
    <Dialog :open="copilotModelEditing" @update:open="(open) => { if (!open) cancelCopilotModelEdit(); }">
      <DialogContent
        class="modal settings-form-modal copilot-model-modal"
        @escape-key-down.prevent
        @pointer-down-outside.prevent
        @interact-outside.prevent
      >
        <header>
          <div class="settings-form-heading">
            <DialogTitle>{{ copilotModelDraft.id ? t("copilot.settingsEditTitle") : t("copilot.settingsAddTitle") }}</DialogTitle>
            <p class="muted">{{ t("copilot.settingsFormHint") }}</p>
          </div>
          <button type="button" :title="t('close')" class="icon-button" @click="cancelCopilotModelEdit"><X /></button>
        </header>
        <div class="settings-form-body">
          <label class="settings-field">
            <span>{{ t("copilot.settingsLabel") }}</span>
            <input v-model="copilotModelDraft.label" spellcheck="false" :placeholder="t('copilot.settingsLabelPlaceholder')" autofocus />
          </label>
          <label class="settings-field">
            <span>{{ t("copilot.settingsBaseUrl") }}</span>
            <input v-model="copilotModelDraft.baseUrl" class="mono" spellcheck="false" placeholder="https://api.openai.com/v1" />
          </label>
          <label class="settings-field">
            <span>{{ t("copilot.settingsModel") }}</span>
            <input v-model="copilotModelDraft.model" class="mono" spellcheck="false" placeholder="gpt-4o-mini" />
          </label>
          <label class="settings-field">
            <span>{{ t("copilot.settingsApiKey") }}</span>
            <input
              v-model="copilotModelDraft.apiKey"
              type="password"
              autocomplete="off"
              :placeholder="copilotModelDraft.hasApiKey ? t('copilot.settingsApiKeyPlaceholder') : t('copilot.settingsApiKey')"
            />
          </label>
          <div class="settings-pref">
            <div class="settings-pref-copy">
              <span class="settings-pref-label">{{ t("copilot.settingsEnabled") }}</span>
            </div>
            <div class="settings-pref-control">
              <Switch size="sm" v-model="copilotModelDraft.enabled" />
            </div>
          </div>
          <p v-if="copilotLlmTestResult" class="copilot-model-test-msg" :data-ok="copilotLlmTestResult.ok">{{ copilotLlmTestResult.message }}</p>
        </div>
        <footer>
          <button
            type="button"
            class="settings-secondary-button"
            :disabled="copilotLlmTesting || copilotLlmSaving || !canTestCopilotModel"
            :title="t('copilot.settingsTestHint')"
            @click="testCopilotModelDraft"
          >
            <Loader2 v-if="copilotLlmTesting" class="spinning" />
            <Zap v-else />
            {{ t("copilot.settingsTest") }}
          </button>
          <button type="button" :disabled="copilotLlmSaving || copilotLlmTesting" @click="cancelCopilotModelEdit">{{ t("cancel") }}</button>
          <button
            type="button"
            class="primary-button"
            :disabled="
              copilotLlmSaving ||
              copilotLlmTesting ||
              !copilotModelDraft.baseUrl.trim() ||
              !copilotModelDraft.model.trim() ||
              (!copilotModelDraft.apiKey.trim() && !copilotModelDraft.hasApiKey)
            "
            @click="saveCopilotModelDraft"
          >
            <Loader2 v-if="copilotLlmSaving" class="spinning" />{{ copilotModelDraft.id ? t("copilot.settingsSave") : t("copilot.settingsAdd") }}
          </button>
        </footer>
      </DialogContent>
    </Dialog>

    <!-- quick sudo 配置档管理弹窗（工具栏 KeyRound 入口；与内联 section 共用草稿状态） -->
    <Dialog :open="profilesOpen" @update:open="(value) => emit('update:profilesOpen', value)">
      <DialogContent class="modal settings-modal profiles-modal" @escape-key-down.prevent>
        <header><DialogTitle>{{ t("profilesTitle") }}</DialogTitle><button :title="t('close')" class="icon-button" @click="emit('update:profilesOpen', false)"><X /></button></header>
        <div class="settings-body">
          <div class="profiles-toolbar">
            <span class="profiles-count muted">{{ t("profilesLimit", { count: sudoProfiles.length, limit: 20 }) }}</span>
            <button v-if="!profileEditing" class="primary-button profiles-add" @click="startProfileCreate"><Plus />{{ t("profilesAdd") }}</button>
          </div>
          <div class="profiles-content">
            <div v-if="sudoProfilesLoading && !sudoProfiles.length" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
            <div v-else-if="!sudoProfiles.length" class="profiles-empty"><ShieldCheck /><p>{{ t("profilesEmpty") }}</p></div>
            <ul v-else class="settings-list profiles-list">
              <li v-for="profile in sudoProfiles" :key="profile.id">
                <div class="settings-list-main">
                  <strong>{{ profile.name }}</strong>
                  <span class="muted">{{ profileSummary(profile) }}</span>
                </div>
                <span class="settings-list-actions">
                  <button class="icon-button" :title="t('profilesEdit')" @click="startProfileEdit(profile)"><Pencil /></button>
                  <button class="icon-button" :title="t('profilesDelete')" @click="removeProfile(profile)"><Trash2 /></button>
                </span>
              </li>
            </ul>
          </div>

          <template v-if="profileEditing">
            <h3 class="settings-section-title">{{ profileDraft.id ? t("profilesEdit") : t("profilesAdd") }}</h3>
            <label class="settings-field">
              <span>{{ t("profilesName") }}</span>
              <input v-model="profileDraft.name" spellcheck="false" :placeholder="t('profilesNamePlaceholder')" />
            </label>
            <label class="settings-field">
              <span>{{ t("profilesPassword") }}</span>
              <input v-model="profileDraft.sudoPassword" type="password" autocomplete="off" :placeholder="profileDraftHadPassword ? t('profilesPasswordKeep') : t('settingsSudoPasswordPlaceholder')" />
            </label>
            <label class="settings-field">
              <span>{{ t("settingsTotp") }}</span>
              <textarea v-model="profileDraft.totpSecret" rows="2" spellcheck="false" :placeholder="profileDraftHadTotp ? t('settingsConfigured') : t('settingsTotpPlaceholder')" />
            </label>
            <label class="settings-field">
              <span>{{ t("settingsFlowMode") }}</span>
              <Select :model-value="profileDraft.authFlowMode" @update:model-value="(v) => (profileDraft.authFlowMode = String(v))">
                <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="password_then_otp">{{ t("flowThenOtp") }}</SelectItem>
                  <SelectItem value="password_plus_otp">{{ t("flowPlusOtp") }}</SelectItem>
                  <SelectItem value="password_only">{{ t("flowOnly") }}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label class="settings-field">
              <span>{{ t("settingsPasswordHint") }}</span>
              <input v-model="profileDraft.passwordPromptHint" spellcheck="false" :placeholder="t('settingsHintPlaceholder')" />
            </label>
            <label class="settings-field">
              <span>{{ t("settingsTotpHint") }}</span>
              <input v-model="profileDraft.totpPromptHint" spellcheck="false" :placeholder="t('settingsHintPlaceholder')" />
            </label>
            <label class="quick-sudo-control">
              <Switch v-model="profileDraft.sudoUsePty" size="sm" />
              <span>{{ t("settingsUsePty") }}</span>
            </label>
            <p v-if="sudoProfilesError" class="task-error">{{ sudoProfilesError }}</p>
            <footer class="profiles-form-actions">
              <button @click="cancelProfileEdit">{{ t("cancel") }}</button>
              <button class="primary-button" :disabled="profileSaving || !profileDraft.name.trim()" @click="saveProfileDraft"><Loader2 v-if="profileSaving" class="spinning" />{{ t("save") }}</button>
            </footer>
          </template>
        </div>
        <footer><button @click="emit('update:profilesOpen', false)">{{ t("close") }}</button></footer>
      </DialogContent>
    </Dialog>

    <!-- 自定义配色方案编辑器：17 个 hex 字段 + 实时预览（Motty font/find 预览同款） -->
    <Dialog :open="schemeEditorOpen" @update:open="(open) => { if (!open) closeSchemeEditor(); }">
      <DialogContent class="modal settings-form-modal scheme-editor-modal" @escape-key-down.prevent @pointer-down-outside.prevent @interact-outside.prevent>
        <header>
          <DialogTitle>{{ schemeEditingId ? t("terminalAppearance.editScheme") : t("terminalAppearance.addScheme") }}</DialogTitle>
          <button type="button" :title="t('close')" class="icon-button" @click="closeSchemeEditor"><X /></button>
        </header>
        <div class="settings-form-body">
          <label class="settings-field">
            <span>{{ t("terminalAppearance.schemeNameLabel") }}</span>
            <input v-model="schemeDraft.name" :placeholder="t('terminalAppearance.schemeNamePlaceholder')" :maxlength="80" autofocus @keydown.enter="saveSchemeDraft" />
          </label>
          <div class="scheme-editor-grid">
            <label v-for="field in ([
              { key: 'background', label: t('terminalAppearance.schemeBackground') },
              { key: 'foreground', label: t('terminalAppearance.schemeForeground') },
              { key: 'cursor', label: t('terminalAppearance.schemeCursor') },
              { key: 'selectionBackground', label: t('terminalAppearance.schemeSelection') },
            ] as const)" :key="field.key" class="scheme-editor-color">
              <span>{{ field.label }}</span>
              <span class="scheme-editor-color-input">
                <input type="color" :value="normalizeHexColor(schemeDraft[field.key]) ?? '#000000'" @input="schemeDraft[field.key] = ($event.target as HTMLInputElement).value" />
                <input v-model="schemeDraft[field.key]" class="mono" spellcheck="false" placeholder="#rrggbb（留空=默认）" />
              </span>
            </label>
          </div>
          <div class="settings-field">
            <span>{{ t("terminalAppearance.schemeAnsiColors") }}</span>
            <div class="scheme-editor-ansi">
              <label v-for="(color, index) in schemeDraft.colors" :key="index" class="scheme-editor-ansi-cell" :title="ANSI_COLOR_NAMES[index]">
                <input type="color" :value="normalizeHexColor(color) ?? '#808080'" @input="schemeDraft.colors[index] = ($event.target as HTMLInputElement).value" />
                <input v-model="schemeDraft.colors[index]" class="mono" spellcheck="false" />
                <span class="scheme-editor-ansi-name">{{ ANSI_COLOR_NAMES[index] }}</span>
              </label>
            </div>
          </div>
          <div class="scheme-editor-preview">
            <TerminalPreviewCard
              :settings="draftPreviewState.settings"
              :custom-schemes="draftPreviewState.customSchemes"
              :host-color-scheme="hostColorScheme"
              :font-family="previewFontFamily"
              :font-size="previewFontSize"
              :t="t"
            />
          </div>
          <p v-if="schemeDraftError" class="task-error">{{ schemeDraftError }}</p>
        </div>
        <footer>
          <button type="button" @click="closeSchemeEditor">{{ t("cancel") }}</button>
          <button type="button" class="primary-button" :disabled="!schemeDraft.name.trim()" @click="saveSchemeDraft">{{ t("save") }}</button>
        </footer>
      </DialogContent>
    </Dialog>

    <!-- 配色方案导入：粘贴 Tabby/iTerm2/WT/Xresources 文本，预览后选入 -->
    <Dialog :open="schemeImportOpen" @update:open="(open) => { if (!open) closeSchemeImport(); }">
      <DialogContent class="modal settings-form-modal scheme-import-modal" @escape-key-down.prevent @pointer-down-outside.prevent @interact-outside.prevent>
        <header>
          <DialogTitle>{{ t("terminalAppearance.importScheme") }}</DialogTitle>
          <button type="button" :title="t('close')" class="icon-button" @click="closeSchemeImport"><X /></button>
        </header>
        <div class="settings-form-body">
          <p class="muted settings-note">{{ t("terminalAppearance.importHint") }}</p>
          <label class="settings-field">
            <span>{{ t("terminalAppearance.importPasteLabel") }}</span>
            <textarea v-model="schemeImportText" class="mono scheme-import-textarea" spellcheck="false" :placeholder="t('terminalAppearance.importPlaceholder')" rows="8"></textarea>
          </label>
          <button type="button" class="settings-secondary-button" :disabled="!schemeImportText.trim()" @click="previewSchemeImport">{{ t("terminalAppearance.importPreview") }}</button>
          <p v-if="schemeImportFormat" class="muted settings-note">{{ t("terminalAppearance.importFormat", { format: schemeImportFormat }) }}</p>
          <ul v-if="schemeImportRows.length" class="settings-list scheme-import-list">
            <li v-for="row in schemeImportRows" :key="row.index">
              <label class="scheme-import-row">
                <input type="checkbox" :checked="schemeImportSelected.includes(row.index)" @change="toggleSchemeImportRow(row.index)" />
                <span class="scheme-import-name">{{ row.name }}</span>
                <span class="picker-swatch" aria-hidden="true"><i v-for="(color, index) in row.hexes" :key="index" :style="{ background: color }" /></span>
              </label>
            </li>
          </ul>
          <p v-if="schemeImportError" class="task-error">{{ schemeImportError }}</p>
        </div>
        <footer>
          <button type="button" @click="closeSchemeImport">{{ t("cancel") }}</button>
          <button type="button" class="primary-button" :disabled="!schemeImportSelected.length" @click="applySchemeImport">{{ t("terminalAppearance.importApply") }}</button>
        </footer>
      </DialogContent>
    </Dialog>

    <!-- 启动命令新增/编辑：与快速命令一致的弹窗样式 -->
    <Dialog :open="startupEditorOpen" @update:open="(open) => { if (!open) closeStartupEditor(); }">
      <DialogContent class="modal settings-form-modal startup-command-modal" @escape-key-down.prevent @pointer-down-outside.prevent @interact-outside.prevent>
        <header>
          <DialogTitle>{{ startupEditorIndex === null ? t("startupCommands.add") : t("startupCommands.edit") }}</DialogTitle>
          <button type="button" :title="t('close')" class="icon-button" @click="closeStartupEditor"><X /></button>
        </header>
        <div class="settings-form-body">
          <div class="settings-pref">
            <div class="settings-pref-copy">
              <span class="settings-pref-label">{{ t("startupCommands.rowEnabled") }}</span>
            </div>
            <div class="settings-pref-control">
              <Switch size="sm" :model-value="startupDraft.enabled" @update:model-value="(value) => (startupDraft.enabled = value === true)" />
            </div>
          </div>
          <label class="settings-field">
            <span>{{ t("startupCommands.command") }}</span>
            <textarea v-model="startupDraft.command" class="mono" rows="4" spellcheck="false" :maxlength="4096" :placeholder="t('startupCommands.commandPlaceholder')" @keydown.ctrl.enter="submitStartupDraft" />
          </label>
          <label class="settings-field settings-field--inline">
            <span>{{ t("startupCommands.delayMs") }}</span>
            <input v-model.number="startupDraft.delayMs" type="number" min="0" max="30000" step="50" class="mono settings-input-narrow" />
          </label>
        </div>
        <footer>
          <button type="button" @click="closeStartupEditor">{{ t("cancel") }}</button>
          <button type="button" class="primary-button" :disabled="!startupDraft.command.trim()" @click="submitStartupDraft">
            {{ startupEditorIndex === null ? t("startupCommands.add") : t("save") }}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
</template>
