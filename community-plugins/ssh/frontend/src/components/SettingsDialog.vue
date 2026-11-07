<script setup lang="ts">
// 设置弹窗（从 App.vue 抽出的独立组件）：承载设置主弹窗与 quick sudo 配置档
// 管理弹窗，两者共用同一份 sudoProfiles/profileDraft 草稿状态。连接级设置
// （ssh/settings/get|set）、配置档（sudo/profiles/*）、已知主机
// （ssh/knownHosts/*）、本机密钥发现（keys/discover）、MCP 限速
// （mcp/settings/*）经全局 window.datawisePlugin.invoke 直调；下载偏好与终端偏好
// （WebGL/选中复制/终端字体）的权威态在宿主 App——下载偏好经 downloadPrefs
// 适配器读写，终端偏好经 props 下发 + emits 上抛。
import { computed, nextTick, reactive, ref, watch, type Component } from "vue";
import { Bot, Check, Download, FolderOpen, KeyRound, Loader2, Pencil, Plus, Shield, ShieldCheck, SquareTerminal, Trash2, X, Zap } from "@lucide/vue";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Switch } from "./ui/switch";
import TerminalSchemePicker from "./TerminalSchemePicker.vue";
import { AGENT_MODES, sanitizeRememberedCommands } from "../lib/agentTerminal";
import { clampFontSize, TERMINAL_FONT_MAX, TERMINAL_FONT_MIN } from "../lib/terminalZoom";
import { loadTerminalFontOverride } from "../lib/terminalFont";
import { MIB, mibField, settingsErrorOf, type DiscoveredKey, type KnownHostEntry, type McpSizeSettings, type SshSettings, type SudoProfileView } from "../lib/settingsModel";
import { DOWNLOAD_CONFLICT_POLICIES, COMPRESSION_STRATEGIES, type CompressionStrategy, type DownloadConflictPolicy } from "../lib/downloadPrefs";
import type { InteractionPrefs } from "../lib/interactionPrefs";
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
  findScheme,
  sanitizeAppearanceSettings,
  TERMINAL_APPEARANCE_PRESETS,
  type TerminalAppearanceProfile,
  type TerminalAppearanceState,
} from "../lib/terminalAppearance";
import { ensureBuiltinSchemeCatalog, getBuiltinTerminalSchemes } from "../lib/terminalScheme";
import type { CopilotChatMode } from "../lib/copilot/types";
import type { CopilotReplyLanguage } from "@datawise/community-copilot-kit";

const QUICK_PRESET_IDS = ["preset-dracula", "preset-nord", "preset-tokyo-night", "preset-gruvbox", "preset-host"] as const;

const COPILOT_MODEL_LIMIT = 12;

const props = defineProps<{
  open: boolean;
  profilesOpen: boolean;
  /** Jump to a settings category when the dialog opens (e.g. dock → agent). */
  focusCategory?: "sudo" | "agent" | "transfer" | "terminal" | "security" | "mcp" | null;
  /** When true with focusCategory agent, open the add-model form. */
  focusAddModel?: boolean;
  sessionId?: string;
  /** Active connection id for per-connection startup commands. */
  connectionId?: string;
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
  /** Default open state for the session copilot dock. */
  copilotDockDefaultOpen: boolean;
  /** Ask = explain only; Agent = propose/run cards. */
  copilotChatMode: CopilotChatMode;
  /** auto = follow UI locale; zh-CN / en = force reply language. */
  copilotReplyLanguage: CopilotReplyLanguage;
  interactionPrefs: InteractionPrefs;
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
  (e: "update:copilotDockDefaultOpen", value: boolean): void;
  (e: "update:copilotChatMode", value: CopilotChatMode): void;
  (e: "update:copilotReplyLanguage", value: CopilotReplyLanguage): void;
  (e: "update:interactionPrefs", value: Partial<InteractionPrefs>): void;
  (e: "copilot-llm-saved"): void;
  (e: "apply-font", payload: { family: string | null; size: number }): void;
  (e: "update:terminalAppearance", value: TerminalAppearanceState): void;
}>();

const t = props.t;

const SETTINGS_CATEGORIES: ReadonlyArray<{
  id: "sudo" | "agent" | "transfer" | "terminal" | "security" | "mcp";
  labelKey: string;
  blurbKey: string;
  icon: Component;
}> = [
  { id: "sudo", labelKey: "settingsNav.sudo", blurbKey: "settingsNav.sudoBlurb", icon: KeyRound },
  { id: "agent", labelKey: "agentTerminalSection", blurbKey: "settingsNav.agentBlurb", icon: Bot },
  { id: "transfer", labelKey: "downloadSettings.title", blurbKey: "settingsNav.transferBlurb", icon: Download },
  { id: "terminal", labelKey: "settingsNav.terminal", blurbKey: "settingsNav.terminalBlurb", icon: SquareTerminal },
  { id: "security", labelKey: "settingsNav.security", blurbKey: "settingsNav.securityBlurb", icon: Shield },
  { id: "mcp", labelKey: "mcpLimits.title", blurbKey: "settingsNav.mcpBlurb", icon: ShieldCheck },
];
type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number]["id"];
const settingsCategory = ref<SettingsCategory>("sudo");
const activeCategory = computed(() => SETTINGS_CATEGORIES.find((cat) => cat.id === settingsCategory.value) ?? SETTINGS_CATEGORIES[0]!);
const schemeBrowserOpen = ref(false);

function onSettingsCategoryChange(value: string | number) {
  settingsCategory.value = value as SettingsCategory;
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

function addStartupRow() {
  if (!canAddStartupCommand(startupBucket.value)) return;
  startupBucket.value = {
    ...startupBucket.value,
    commands: [
      ...startupBucket.value.commands,
      { command: "", delayMs: STARTUP_DELAY_DEFAULT_MS, enabled: true },
    ],
  };
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
const terminalFontFamilyChoice = ref(TERMINAL_FONT_FOLLOW_HOST);
const terminalFontCustomDraft = ref("");
const terminalFontSizeDraft = ref(String(props.terminalFontSize));

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

watch(() => props.open, (open) => {
  if (!open) {
    prefsReady.value = false;
    cancelCopilotModelEdit();
    return;
  }
  if (props.focusCategory) {
    settingsCategory.value = props.focusCategory;
  }
  void hydrateBuiltinSchemes();
  void reloadSettings().then(() => {
    // Only jump into "add model" when the store is actually empty.
    if (props.focusAddModel && props.focusCategory === "agent" && !copilotModels.value.length) {
      startCopilotModelCreate();
    }
  });
}, { immediate: true });

watch(settingsCategory, (id) => {
  if (id !== "security") return;
  void loadKnownHosts();
  void loadLocalKeys();
});

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
  copilotModelEditing.value = true;
}

function cancelCopilotModelEdit() {
  copilotModelEditing.value = false;
  resetCopilotModelDraft();
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

async function saveMcpSettings() {
  if (!mcpInputsValid.value || mcpSaving.value) return;
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
    emit("notice", t("mcpLimits.saved"));
  } catch (cause) {
    mcpError.value = settingsErrorOf(cause);
  } finally {
    mcpSaving.value = false;
  }
}

const prefsReady = ref(false);
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
 * 一次保存链：本机偏好（下载/编辑器/启动命令）+ 连接设置 + MCP。
 * 关窗 / Esc /「保存」共用；quiet 时不弹成功 toast（关窗静默落盘）。
 */
async function saveSettings(options: { quiet?: boolean } = {}) {
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
      if (settingsDraft.sudoPassword) updates.sudoPassword = settingsDraft.sudoPassword;
      if (settingsDraft.totpSecret.trim()) updates.totpSecret = settingsDraft.totpSecret;
      const meta = await window.datawisePlugin.invoke<SshSettings>("ssh/settings/set", { sessionId: props.sessionId, ...updates });
      settingsMeta.value = meta;
      settingsDraft.sudoPassword = "";
      settingsDraft.totpSecret = "";
      await saveMcpSettings();
    }
    if (!options.quiet) emit("notice", t("settingsSaved"));
  } catch (cause) {
    emit("error", cause);
  } finally {
    settingsSaving.value = false;
  }
}

/** 关窗前落盘；供 Esc / 关闭按钮 / Dialog dismiss 共用。 */
async function flushSettings() {
  window.clearTimeout(startupPersistTimer);
  await saveSettings({ quiet: true });
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

defineExpose({ consumeInlineEsc, flushSettings, setDownloadDirDraft, setDownloadUseDefaultDraft });
</script>

<template>
    <!-- 设置主弹窗 -->
    <Dialog :open="open" @update:open="onSettingsOpenChange">
      <DialogContent class="modal settings-modal settings-nav-modal" @escape-key-down.prevent>
        <header><DialogTitle>{{ t("settings") }}</DialogTitle><button :title="t('close')" class="icon-button" @click="closeSettings"><X /></button></header>
        <div class="settings-body">
          <div class="settings-layout">
            <nav class="settings-nav" aria-label="settings categories">
              <Tabs :model-value="settingsCategory" orientation="vertical" class="settings-nav-tabs" @update:model-value="onSettingsCategoryChange">
                <TabsList class="settings-nav-list">
                  <TabsTrigger v-for="cat in SETTINGS_CATEGORIES" :key="cat.id" :value="cat.id" class="settings-nav-item">
                    <component :is="cat.icon" class="settings-nav-icon" aria-hidden="true" />
                    <span>{{ t(cat.labelKey) }}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </nav>
            <div class="settings-content">
            <div v-show="settingsCategory === 'sudo'" class="settings-pane">
            <section class="settings-card">
            <h3 class="settings-card-title">{{ t(activeCategory.labelKey) }}</h3>
            <p class="muted settings-note">{{ t(activeCategory.blurbKey) }}</p>
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
            <section v-if="profilesInlineOpen" class="profiles-inline">
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
            <label class="quick-sudo-control">
              <Switch v-model="settingsDraft.quickSudo" size="sm" />
              <span>{{ t("settingsQuickSudo") }}</span>
            </label>
            <template v-if="!boundProfile">
            <label class="settings-field">
              <span>{{ t("settingsSudoPassword") }}</span>
              <input v-model="settingsDraft.sudoPassword" type="password" autocomplete="off" :placeholder="settingsMeta?.sudoPasswordSet ? t('settingsConfigured') : t('settingsSudoPasswordPlaceholder')" />
            </label>
            <label class="settings-field">
              <span>{{ t("settingsTotp") }}</span>
              <textarea v-model="settingsDraft.totpSecret" rows="2" spellcheck="false" :placeholder="settingsMeta?.totpConfigured ? t('settingsConfigured') : t('settingsTotpPlaceholder')" />
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
            <label class="quick-sudo-control">
              <Switch v-model="settingsDraft.sudoUsePty" size="sm" />
              <span>{{ t("settingsUsePty") }}</span>
            </label>
            </template>
            <p v-if="sudoProfilesError" class="task-error">{{ sudoProfilesError }} <button class="link-button" @click="loadSudoProfiles">{{ t("refresh") }}</button></p>
            </template>
            </section>
            </div>

            <div v-show="settingsCategory === 'agent'" class="settings-pane">
            <section class="settings-card">
            <h3 class="settings-card-title">{{ t(activeCategory.labelKey) }}</h3>
            <p class="muted settings-note">{{ t(activeCategory.blurbKey) }}</p>
            <div v-if="settingsLoading" class="empty compact"><Loader2 class="spinning" />{{ t("loading") }}</div>
            <div v-else-if="settingsLoadFailed" class="task-error" role="alert">
              {{ t("settingsLoadFailed") }}
              <button class="link-button" @click="reloadSettings">{{ t("refresh") }}</button>
            </div>
            <template v-else>
            <label class="settings-field">
              <span>{{ t("agentTerminalMode") }}</span>
              <Select :model-value="settingsDraft.agentTerminalMode" @update:model-value="(v) => (settingsDraft.agentTerminalMode = String(v))">
                <SelectTrigger size="xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="mode in AGENT_MODES" :key="mode" :value="mode">{{ t(`agentTerminal${mode === "off" ? "Off" : mode === "auto" ? "Auto" : "Strict"}`) }}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div class="settings-remembered">
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

            <section class="settings-card">
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

              <div class="copilot-models-head">
                <div class="copilot-models-copy">
                  <span class="settings-pref-label">{{ t("copilot.settingsModels") }}</span>
                  <span class="muted settings-pref-hint">{{ t("copilot.settingsModelsHint", { count: copilotModels.length, limit: COPILOT_MODEL_LIMIT }) }}</span>
                </div>
                <button
                  v-if="!copilotModelEditing"
                  type="button"
                  class="primary-button profiles-add"
                  :disabled="copilotModels.length >= COPILOT_MODEL_LIMIT"
                  @click="startCopilotModelCreate"
                ><Plus />{{ t("copilot.settingsAdd") }}</button>
              </div>

              <p v-if="!copilotModels.length && !copilotModelEditing" class="muted settings-note">{{ t("copilot.settingsEmpty") }}</p>
              <ul v-else-if="copilotModels.length" class="settings-list copilot-models-list">
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

              <div v-if="copilotModelEditing" class="copilot-model-form">
                <h4 class="settings-section-title">{{ copilotModelDraft.id ? t("copilot.settingsEdit") : t("copilot.settingsAdd") }}</h4>
                <label class="settings-field">
                  <span>{{ t("copilot.settingsLabel") }}</span>
                  <input v-model="copilotModelDraft.label" spellcheck="false" :placeholder="t('copilot.settingsLabelPlaceholder')" />
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
                    :placeholder="copilotModelDraft.hasApiKey ? t('copilot.settingsApiKeyPlaceholder') : ''"
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
                <p
                  v-if="copilotLlmTestResult"
                  class="copilot-model-test-msg"
                  :data-ok="copilotLlmTestResult.ok"
                >{{ copilotLlmTestResult.message }}</p>
                <footer class="copilot-model-actions">
                  <button
                    type="button"
                    class="copilot-model-btn is-test"
                    :disabled="copilotLlmTesting || copilotLlmSaving || !canTestCopilotModel"
                    :title="t('copilot.settingsTestHint')"
                    @click="testCopilotModelDraft"
                  >
                    <Loader2 v-if="copilotLlmTesting" class="spinning" />
                    <Zap v-else />
                    {{ t("copilot.settingsTest") }}
                  </button>
                  <div class="copilot-model-actions-end">
                    <button type="button" class="copilot-model-btn" :disabled="copilotLlmSaving || copilotLlmTesting" @click="cancelCopilotModelEdit">{{ t("cancel") }}</button>
                    <button
                      type="button"
                      class="copilot-model-btn is-save"
                      :disabled="
                        copilotLlmSaving ||
                        copilotLlmTesting ||
                        !copilotModelDraft.baseUrl.trim() ||
                        !copilotModelDraft.model.trim() ||
                        (!copilotModelDraft.apiKey.trim() && !copilotModelDraft.hasApiKey)
                      "
                      @click="saveCopilotModelDraft"
                    >
                      <Loader2 v-if="copilotLlmSaving" class="spinning" />{{ t("copilot.settingsSave") }}
                    </button>
                  </div>
                </footer>
              </div>
            </section>
            </div>

            <div v-show="settingsCategory === 'transfer'" class="settings-pane">
            <section class="settings-card">
            <h3 class="settings-card-title">{{ t("downloadSettings.title") }}</h3>
            <p class="muted settings-note">{{ t(activeCategory.blurbKey) }}</p>
            <label class="settings-field">
              <span>{{ t("downloadSettings.directory") }}</span>
              <span class="settings-dir-row">
                <input v-model="downloadDirDraft" class="mono" spellcheck="false" :placeholder="localDownloadDir || t('downloadSettings.default')" />
                <button v-if="localCanSave" type="button" class="browse-button" :title="t('downloadSettings.browse')" :aria-label="t('downloadSettings.browse')" @click="emit('browse-download-dir')"><FolderOpen /></button>
              </span>
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
            <h3 class="settings-card-title">{{ t("downloadSettings.conflictTitle") }}</h3>
            <label v-for="policy in DOWNLOAD_CONFLICT_POLICIES" :key="policy" class="settings-field settings-radio-row">
              <input v-model="downloadConflictDraft" type="radio" name="download-conflict-policy" :value="policy" />
              <span>{{ t(`downloadSettings.conflict.${policy}`) }}</span>
            </label>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title">{{ t("downloadSettings.compressionTitle") }}</h3>
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
            <h3 class="settings-card-title">{{ t("sftpEdit.settingsSection") }}</h3>
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
            <span class="settings-field"><span>{{ t("sftpEdit.uploadPolicyTitle") }}</span></span>
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
            <p v-if="!editorConfigDraft.associations.length" class="muted settings-note">{{ t("sftpEdit.noAssociations") }}</p>
            <div v-for="(assoc, index) in editorConfigDraft.associations" :key="`${assoc.pattern}-${index}`" class="flex items-center gap-2 py-0.5">
              <code class="mono">{{ assoc.pattern }}</code>
              <span class="muted">→ {{ editorTargetName(associationTargetValue(assoc)) }}</span>
              <button type="button" class="icon-button" :title="t('delete')" @click="removeEditorAssociation(index)"><Trash2 /></button>
            </div>
            <div class="flex items-center gap-2 py-0.5">
              <input v-model="editorAssociationPatternDraft" class="mono" spellcheck="false" :placeholder="t('sftpEdit.associationPatternPlaceholder')" />
              <Select :model-value="editorAssociationTargetDraft || SELECT_EMPTY_SENTINEL" @update:model-value="(v) => (editorAssociationTargetDraft = v === SELECT_EMPTY_SENTINEL ? '' : String(v))">
                <SelectTrigger size="xs"><SelectValue :placeholder="t('sftpEdit.associationTargetPlaceholder')" /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="SELECT_EMPTY_SENTINEL">{{ t("sftpEdit.associationTargetPlaceholder") }}</SelectItem>
                  <SelectItem v-for="opt in editorTargetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button type="button" :disabled="!editorAssociationPatternDraft.trim() || !editorAssociationTargetDraft" @click="addEditorAssociation"><Plus />{{ t("sftpEdit.addAssociation") }}</button>
            <p class="muted settings-note">{{ t("sftpEdit.associationsHint") }}</p>
            <h3 class="settings-card-title">{{ t("sftpEdit.customEditorsTitle") }}</h3>
            <p v-if="!editorConfigDraft.customEditors.length" class="muted settings-note">{{ t("sftpEdit.noCustomEditors") }}</p>
            <div v-for="editor in editorConfigDraft.customEditors" :key="editor.id" class="flex items-center gap-2 py-0.5">
              <strong>{{ editor.name }}</strong>
              <code class="mono muted" :title="editor.command">{{ editor.command }}</code>
              <button type="button" class="icon-button" :title="t('delete')" @click="removeCustomEditor(editor.id)"><Trash2 /></button>
            </div>
            </section>
            </div>

            <div v-show="settingsCategory === 'terminal'" class="settings-pane">
            <section class="settings-card">
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
            </template>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title">{{ t("terminalAppearance.renderingSection") }}</h3>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("webglLabel") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch size="sm" :model-value="webglEnabled" @update:model-value="(value) => emit('update:webgl', value === true)" />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("x11Forwarding.label") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch size="sm" :model-value="x11Forwarding" @update:model-value="onX11ForwardingChange" />
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
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title">{{ t("interactionPrefs.section") }}</h3>
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
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.figCompletion") }}</span>
                <span class="settings-pref-hint">{{ t("interactionPrefs.figCompletionHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="interactionPrefs.figCompletionEnabled"
                  @update:model-value="(value) => emit('update:interactionPrefs', { figCompletionEnabled: value === true })"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.lineSuggest") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="interactionPrefs.lineSuggestEnabled"
                  @update:model-value="(value) => emit('update:interactionPrefs', { lineSuggestEnabled: value === true })"
                />
              </div>
            </div>
            <div class="settings-pref">
              <div class="settings-pref-copy">
                <span class="settings-pref-label">{{ t("interactionPrefs.suggestCompact") }}</span>
                <span class="settings-pref-hint">{{ t("interactionPrefs.suggestCompactHint") }}</span>
              </div>
              <div class="settings-pref-control">
                <Switch
                  size="sm"
                  :model-value="interactionPrefs.suggestCompactMode"
                  :disabled="!interactionPrefs.lineSuggestEnabled"
                  @update:model-value="(value) => emit('update:interactionPrefs', { suggestCompactMode: value === true })"
                />
              </div>
            </div>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title">{{ t("startupCommands.title") }}</h3>
            <template v-if="connectionId">
              <div class="settings-pref">
                <div class="settings-pref-copy">
                  <span class="settings-pref-label">{{ t("startupCommands.enabled") }}</span>
                </div>
                <div class="settings-pref-control">
                  <Switch size="sm" :model-value="startupBucket.enabled" @update:model-value="(value) => (startupBucket = { ...startupBucket, enabled: value === true })" />
                </div>
              </div>
              <ul class="settings-list startup-commands-list">
                <li v-for="(row, index) in startupBucket.commands" :key="index">
                  <label class="settings-field settings-switch-row">
                    <Switch size="sm" :model-value="row.enabled" @update:model-value="(value) => (row.enabled = value === true)" />
                    <span>{{ t("startupCommands.rowEnabled") }}</span>
                  </label>
                  <label class="settings-field">
                    <span>{{ t("startupCommands.command") }}</span>
                    <input v-model="row.command" class="mono" spellcheck="false" :placeholder="t('startupCommands.commandPlaceholder')" />
                  </label>
                  <label class="settings-field">
                    <span>{{ t("startupCommands.delayMs") }}</span>
                    <input v-model.number="row.delayMs" type="number" min="0" max="30000" step="50" class="mono settings-input-narrow" />
                  </label>
                  <div class="startup-commands-row-actions">
                    <button type="button" class="icon-button" :title="t('startupCommands.moveUp')" :disabled="index === 0" @click="moveStartupRow(index, -1)">↑</button>
                    <button type="button" class="icon-button" :title="t('startupCommands.moveDown')" :disabled="index >= startupBucket.commands.length - 1" @click="moveStartupRow(index, 1)">↓</button>
                    <button type="button" class="icon-button" :title="t('delete')" @click="removeStartupRow(index)"><Trash2 /></button>
                  </div>
                </li>
              </ul>
              <p class="muted settings-note">{{ t("startupCommands.limit", { count: startupBucket.commands.length, limit: STARTUP_COMMANDS_LIMIT }) }}</p>
              <button type="button" :disabled="!canAddStartupCommand(startupBucket)" @click="addStartupRow"><Plus />{{ t("startupCommands.add") }}</button>
            </template>
            <p v-else class="muted settings-note">{{ t("startupCommands.needsConnection") }}</p>
            </section>

            <section class="settings-card">
            <h3 class="settings-card-title">{{ t("terminalFont.title") }}</h3>
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
              <div class="settings-pref-control">
                <input v-model="terminalFontSizeDraft" type="number" class="mono settings-input-narrow" :min="TERMINAL_FONT_MIN" :max="TERMINAL_FONT_MAX" step="1" @change="applyTerminalFontFromControls" />
                <button type="button" @click="resetTerminalFont">{{ t("terminalFont.reset") }}</button>
              </div>
            </div>
            </section>
            </div>

          <div v-show="settingsCategory === 'security'" class="settings-pane">
          <section class="settings-card">
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
          <h3 class="settings-card-title">{{ t("keysPanel.title") }}</h3>
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

          <div v-show="settingsCategory === 'mcp'" class="settings-pane">
          <section class="settings-card">
          <h3 class="settings-card-title">{{ t(activeCategory.labelKey) }}</h3>
          <p class="muted settings-note">{{ t(activeCategory.blurbKey) }}</p>
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
        <footer class="settings-footer">
          <p class="muted settings-autosave-hint">{{ t("settingsAutoSaveHint") }}</p>
          <div class="settings-footer-actions">
            <button type="button" :disabled="settingsLoading || settingsLoadFailed || settingsSaving || (!settingsMeta?.sudoPasswordSet && !settingsMeta?.totpConfigured)" @click="clearStoredSecrets"><Trash2 />{{ t("settingsClearSecrets") }}</button>
            <button type="button" :disabled="settingsSaving" @click="closeSettings">{{ t("close") }}</button>
            <button type="button" class="primary-button" :disabled="settingsLoading || settingsSaving" @click="() => saveSettings()"><Loader2 v-if="settingsSaving" class="spinning" />{{ t("settingsSave") }}</button>
          </div>
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
</template>
