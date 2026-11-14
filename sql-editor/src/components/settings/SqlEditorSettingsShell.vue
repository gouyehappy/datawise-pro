<script setup lang="ts">
/**
 * SQL 编辑器设置面板主体（抽屉与 App 设置页共用）。
 *
 * 结构：左侧竖向导航 + 右侧 tab 内容 + 底部重置个人配置。
 */
import {computed, inject, onBeforeUnmount, onMounted, ref, unref, watch} from 'vue'
import {
  type SqlEditorShortcutsController,
} from '@sql-editor/composables/useSqlEditorShortcutsController'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import {useKeybindingRecorder} from '@sql-editor/composables/useKeybindingRecorder'
import {useSettingsSnippetEditor} from '@sql-editor/composables/useSettingsSnippetEditor'
import {resolveEditorUiTone} from '@sql-editor/utils/editor-ui-tone'
import {
  groupItemsByCompletionSlot,
  resolvePrimaryCompletionSlot,
} from '@sql-editor/constants/completion-slots'
import {filterRedundantGlobalSnippetsForDisplay} from '@sql-editor/config/snippets/merge'
import SettingsSnippetsPanel from '@sql-editor/components/settings/SettingsSnippetsPanel.vue'
import SettingsBehaviorPanel from '@sql-editor/components/settings/SettingsBehaviorPanel.vue'
import SettingsKeybindingsPanel from '@sql-editor/components/settings/SettingsKeybindingsPanel.vue'
import SettingsQuickChipsPanel from '@sql-editor/components/settings/SettingsQuickChipsPanel.vue'
import type {SqlEditorFormatterSettings} from '@sql-editor/config/formatter-settings'
import {SQL_EDITOR_FONT_SIZE_DEFAULT} from '@sql-editor/config/formatter-settings'
import {
  buildSqlEditorThemeOptions,
  normalizeSqlEditorThemeId,
  SQL_EDITOR_DARK_THEME,
  SQL_EDITOR_LIGHT_THEME,
} from '@sql-editor/constants/editor-themes'
import {applySqlEditorMonacoTheme} from '@sql-editor/monaco/themes'
import {SQL_EDITOR_CONFIG_KEY} from '@sql-editor/config/injection'
import {DEFAULT_SQL_EDITOR_THEME} from '@sql-editor/config/defaults'
import {
    isSqlEditorThemeHostManaged,
    resolveSqlEditorTheme,
} from '@sql-editor/utils/resolve-editor-theme'

type SettingsTabId = 'behavior' | 'keybindings' | 'quick' | 'snippets'

const props = withDefaults(
    defineProps<{
      controller: SqlEditorShortcutsController
      layout?: 'drawer' | 'page'
      showClose?: boolean
      showNav?: boolean
      initialTab?: SettingsTabId
      visibleTabs?: SettingsTabId[]
    }>(),
    {
      layout: 'drawer',
      showClose: false,
      showNav: true,
      initialTab: 'behavior',
    },
)

const emit = defineEmits<{
  close: []
  'update:activeTab': [tab: SettingsTabId]
}>()

const globalConfig = inject(SQL_EDITOR_CONFIG_KEY, null)

const {t} = useSqlEditorI18n()

const activeTab = ref<SettingsTabId>(props.initialTab)
const resetConfirmOpen = ref(false)

function setActiveTab(tab: SettingsTabId) {
  activeTab.value = tab
  emit('update:activeTab', tab)
}

const controller = props.controller

const {
  settings,
  hasCustomConfig,
  patchSettings,
  setQuickChipEnabled,
  isQuickChipEnabled,
  setKeybindingEnabled,
  isKeybindingEnabled,
  updateKeybindingKeys,
  toggleSnippet,
  upsertPersonalSnippet,
  addCustomSnippet,
  removePersonalSnippet,
  hasSnippetOverride,
  isCustomSnippetId,
  resetPersonal,
  builtinChips,
} = controller
const hostTheme = computed(() => unref(globalConfig?.theme) ?? DEFAULT_SQL_EDITOR_THEME)
const hostManagedTheme = computed(() => isSqlEditorThemeHostManaged(globalConfig))
const resolvedTheme = computed(() =>
    resolveSqlEditorTheme({
        personalTheme: settings.value.theme,
        hostTheme: hostTheme.value,
        hostManaged: hostManagedTheme.value,
    }),
)
const themeOptions = computed(() =>
    buildSqlEditorThemeOptions((id) =>
        id === SQL_EDITOR_DARK_THEME ? t('settings.editor_theme_dark') : t('settings.editor_theme_light'),
    ),
)
const uiTone = computed(() => resolveEditorUiTone(resolvedTheme.value))
const shellTone = computed(() => (props.layout === 'page' ? 'light' : uiTone.value))

function onSetTheme(theme: string) {
  const normalized = normalizeSqlEditorThemeId(theme)
  if (!normalized) return
  if (hostManagedTheme.value) {
    globalConfig?.setTheme?.(normalized)
  } else {
    patchSettings({theme: normalized})
  }
  applySqlEditorMonacoTheme(normalized)
}

const hostFontSize = computed(() => globalConfig?.monacoOptions?.()?.fontSize ?? SQL_EDITOR_FONT_SIZE_DEFAULT)
const effectiveFontSize = computed(() => settings.value.fontSize ?? hostFontSize.value)
const formatterSettings = computed(() => settings.value.formatter!)

function patchFormatter(patch: Partial<SqlEditorFormatterSettings>) {
  patchSettings({
    formatter: {
      ...formatterSettings.value,
      ...patch,
    },
  })
}

const allTabs = computed(() => [
  {id: 'behavior' as const, label: t('settings.tab.behavior'), short: t('settings.tab.behavior_short')},
  {id: 'keybindings' as const, label: t('settings.tab.keybindings'), short: t('settings.tab.keybindings_short')},
  {id: 'quick' as const, label: t('settings.tab.quick'), short: t('settings.tab.quick_short')},
  {id: 'snippets' as const, label: t('settings.tab.snippets'), short: t('settings.tab.snippets_short')},
])

const tabs = computed(() => {
  const allowed = props.visibleTabs?.length ? new Set(props.visibleTabs) : null
  if (!allowed) return allTabs.value
  return allTabs.value.filter((tab) => allowed.has(tab.id))
})

const showTabNav = computed(() => props.showNav && tabs.value.length > 1)

const activeTabMeta = computed(() => tabs.value.find((tab) => tab.id === activeTab.value) ?? tabs.value[0])

function syncActiveTab() {
  if (!tabs.value.length) return
  if (!tabs.value.some((tab) => tab.id === activeTab.value)) {
    activeTab.value = tabs.value[0].id
  }
}

watch(() => props.initialTab, (tab) => {
  activeTab.value = tab
  syncActiveTab()
})

watch(tabs, syncActiveTab, {immediate: true})
const keybindings = computed(() => settings.value.keybindings ?? [])

const {
  keybindingError,
  recordingEntryKey,
  stopRecording,
  isRecordingBinding,
  startRecording,
  keyDisplay,
} = useKeybindingRecorder({
  keybindings,
  isKeybindingEnabled,
  updateKeybindingKeys,
  invalidMessage: t('settings.keybinding_invalid'),
  listenMessage: t('settings.keybinding_listen'),
})

const groupedQuickChips = computed(() =>
    groupItemsByCompletionSlot(
        builtinChips.value,
        (chip) => chip.slots[0] ?? 'where',
        (a, b) => a.label.localeCompare(b.label),
    ),
)

const groupedSnippets = computed(() =>
    groupItemsByCompletionSlot(
        filterRedundantGlobalSnippetsForDisplay(settings.value.snippets),
        (item) => resolvePrimaryCompletionSlot(item.slots),
        (a, b) => a.label.localeCompare(b.label),
    ),
)

const {
  expandedId: expandedSnippetId,
  showAddForm: showAddSnippet,
  draft: snippetDraft,
  newDraft: newSnippetDraft,
  toggle: toggleSnippetExpand,
  close: closeSnippetEditor,
  save: saveSnippetEditor,
  remove: deleteSnippetEditor,
  submitNew: submitNewSnippet,
} = useSettingsSnippetEditor({
  snippets: computed(() => settings.value.snippets),
  addCustomSnippet,
  upsertPersonalSnippet,
  removePersonalSnippet,
  hasSnippetOverride,
})

function resetPanelEditors() {
  closeSnippetEditor()
  stopRecording()
}

watch(activeTab, resetPanelEditors)

function closePanel() {
  emit('close')
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (recordingEntryKey.value) {
    stopRecording()
    return
  }
  if (resetConfirmOpen.value) {
    resetConfirmOpen.value = false
    return
  }
  if (props.showClose) closePanel()
}

onMounted(() => {
  window.addEventListener('keydown', onEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
})

function onResetClick() {
  resetConfirmOpen.value = true
}

function cancelReset() {
  resetConfirmOpen.value = false
}

function confirmReset() {
  resetPersonal()
  resetConfirmOpen.value = false
  resetPanelEditors()
}

function toggleAddSnippetForm() {
  showAddSnippet.value = !showAddSnippet.value
}

function cancelAddSnippetForm() {
  showAddSnippet.value = false
}
</script>

<template>
  <aside
      class="sql-settings-shell"
      :class="[`sql-settings-shell--${layout}`, { 'is-confirming': resetConfirmOpen, 'sql-settings-shell--with-nav': showTabNav }]"
      :data-tone="shellTone"
      role="region"
      :aria-label="t('settings.title')"
  >
    <header class="panel-head">
      <div class="panel-title-wrap">
        <span class="panel-title">{{ t('settings.title') }}</span>
        <span class="config-badge" :class="{ custom: hasCustomConfig }">
            {{ hasCustomConfig ? t('settings.config_custom') : t('settings.config_default') }}
          </span>
      </div>
      <button
          v-if="showClose"
          type="button"
          class="panel-close"
          :title="t('settings.close')"
          @click="closePanel"
      >×
      </button>
    </header>

    <div class="panel-shell">
      <nav v-if="showTabNav" class="panel-nav" role="tablist" :aria-label="t('settings.title')">
        <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            class="nav-item"
            :class="{ active: activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            :title="tab.label"
            @click="setActiveTab(tab.id)"
        >
            <span class="nav-icon" aria-hidden="true">
              <svg v-if="tab.id === 'behavior'" viewBox="0 0 16 16" width="14" height="14">
                <path fill="currentColor"
                      d="M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM3 8a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z"/>
                <path fill="currentColor"
                      d="M11.5 2.5 13 4l-1.2 1.2-.9-.9-.4 1.3 1.3.4-.9.9L9 6.5l1.5-1.5 1.3.4-.4-1.3.9-.9-.9-.9Z"/>
              </svg>
              <svg v-else-if="tab.id === 'keybindings'" viewBox="0 0 16 16" width="14" height="14">
                <path fill="currentColor"
                      d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v4A1.5 1.5 0 0 1 12.5 10H10v1h1.5a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1H6v-1H3.5A1.5 1.5 0 0 1 2 8.5v-4Z"/>
              </svg>
              <svg v-else-if="tab.id === 'quick'" viewBox="0 0 16 16" width="14" height="14">
                <path fill="currentColor" d="M9.2 1.6 6.1 9.3 3.7 6.9l-.7.7 3.2 3.2 3.9-8.5-.9-.7Z"/>
                <path fill="currentColor" d="M3 12.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5Z"/>
              </svg>
              <svg v-else viewBox="0 0 16 16" width="14" height="14">
                <path fill="currentColor"
                      d="M5 3.5 3.5 5v6L5 12.5h6L12.5 11V5L11 3.5H5Zm0-1h6l2 2v6l-2 2H5l-2-2v-6l2-2Z"/>
              </svg>
            </span>
          <span class="nav-label">{{ tab.short }}</span>
        </button>
      </nav>

      <div class="panel-main" :class="{'panel-main--solo': !showTabNav}">
        <div v-if="showTabNav" class="panel-section-head">{{ activeTabMeta.label }}</div>

        <div class="panel-body">
          <SettingsBehaviorPanel
              v-if="activeTab === 'behavior'"
              :settings="settings"
              :formatter-settings="formatterSettings"
              :effective-font-size="effectiveFontSize"
              :editor-theme="resolvedTheme"
              :theme-options="themeOptions"
              @patch-settings="patchSettings"
              @patch-formatter="patchFormatter"
              @set-theme="onSetTheme"
          />

          <SettingsKeybindingsPanel
              v-else-if="activeTab === 'keybindings'"
              :keybindings="keybindings"
              :keybinding-error="keybindingError"
              :is-keybinding-enabled="isKeybindingEnabled"
              :is-recording-binding="isRecordingBinding"
              :key-display="keyDisplay"
              @toggle-enabled="setKeybindingEnabled"
              @start-recording="startRecording"
          />

          <SettingsQuickChipsPanel
              v-else-if="activeTab === 'quick'"
              :groups="groupedQuickChips"
              :is-quick-chip-enabled="isQuickChipEnabled"
              @toggle-chip="setQuickChipEnabled"
          />

          <SettingsSnippetsPanel
              v-else-if="activeTab === 'snippets'"
              :groups="groupedSnippets"
              :expanded-id="expandedSnippetId"
              :show-add-form="showAddSnippet"
              :draft="snippetDraft"
              :new-draft="newSnippetDraft"
              :has-snippet-override="hasSnippetOverride"
              :is-custom-snippet-id="isCustomSnippetId"
              @toggle-snippet="toggleSnippetExpand"
              @toggle-enabled="toggleSnippet"
              @save="saveSnippetEditor"
              @remove="deleteSnippetEditor"
              @toggle-add-form="toggleAddSnippetForm"
              @cancel-add="cancelAddSnippetForm"
              @submit-new="submitNewSnippet"
              @update:draft-label="snippetDraft.label = $event"
              @update:draft-insert-text="snippetDraft.insertText = $event"
              @update:draft-detail="snippetDraft.detail = $event"
              @update:new-label="newSnippetDraft.label = $event"
              @update:new-insert-text="newSnippetDraft.insertText = $event"
              @update:new-detail="newSnippetDraft.detail = $event"
              @update:new-slot="newSnippetDraft.slot = $event"
          />
        </div>

        <footer class="panel-foot">
          <button
              type="button"
              class="btn-reset"
              :disabled="!hasCustomConfig"
              @click="onResetClick"
          >
            {{ t('settings.reset_personal') }}
          </button>
        </footer>
      </div>
    </div>

    <div
        v-if="resetConfirmOpen"
        class="panel-confirm"
        role="alertdialog"
        :aria-label="t('settings.reset_confirm')"
        @click.stop
    >
      <p class="confirm-text">{{ t('settings.reset_confirm') }}</p>
      <div class="confirm-actions">
        <button type="button" class="btn-ghost" @click="cancelReset">
          {{ t('settings.reset_cancel') }}
        </button>
        <button type="button" class="btn-danger-solid" @click="confirmReset">
          {{ t('settings.reset_apply') }}
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* --se-* 主题变量会继承到 settings 子面板 */
.sql-settings-shell {
  --se-accent: var(--dw-primary, var(--dw-accent, #0969da));
  --se-bg: var(--dw-bg-panel, var(--dw-bg-editor, var(--dw-bg, #fff)));
  --se-bg-muted: var(--dw-bg-muted, color-mix(in srgb, var(--se-bg) 92%, var(--se-text) 8%));
  --se-bg-hover: var(--dw-bg-hover, color-mix(in srgb, var(--se-bg) 88%, var(--se-text) 12%));
  --se-border: var(--dw-border-light, var(--dw-border, rgba(0, 0, 0, 0.08)));
  --se-text: var(--dw-text, #111827);
  --se-text-secondary: var(--dw-text-secondary, #6b7280);
  --se-text-muted: var(--dw-text-muted, #9ca3af);
  --se-shadow: var(--dw-menu-shadow, var(--dw-shadow, 0 8px 24px rgba(15, 23, 42, 0.12)));
  --se-chip: #ea580c;
  --se-danger: #dc2626;

  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  border: 1px solid var(--se-border);
  background: var(--se-bg);
  color: var(--se-text);
  box-shadow: var(--se-shadow);
  overflow: hidden;
  font-size: 11px;
  line-height: 1.35;
}

.sql-settings-shell--drawer {
  width: min(292px, calc(100% - 4px));
  max-height: calc(100% - 4px);
}

.sql-settings-shell--page {
  width: 100%;
  max-width: none;
  min-height: clamp(420px, 50vh, 560px);
  font-size: 12px;
}

.sql-settings-shell--page:not(.sql-settings-shell--with-nav) .panel-main {
  border-radius: 0;
}

.sql-settings-shell[data-tone='dark'] {
  --se-bg: var(--dw-bg-panel, #1e1f22);
  --se-bg-muted: var(--dw-bg-muted, #222326);
  --se-bg-hover: var(--dw-bg-hover, #2a2b2e);
  --se-border: var(--dw-panel-outline, var(--dw-panel-border, rgba(255, 255, 255, 0.08)));
  --se-text: var(--dw-text, #f0f0f3);
  --se-text-secondary: var(--dw-text-secondary, #d4d4d8);
  --se-text-muted: var(--dw-text-muted, #c4c7cc);
  --se-shadow: var(--dw-menu-shadow, 0 8px 28px rgba(0, 0, 0, 0.45));
}

.sql-settings-shell[data-tone='light'] {
  --se-bg: var(--dw-bg-panel, var(--dw-bg, #fff));
  --se-bg-muted: var(--dw-bg-muted, #f8f9fb);
  --se-bg-hover: var(--dw-bg-hover, #f3f4f6);
  --se-border: var(--dw-border-light, #eef0f3);
  --se-text: var(--dw-text, #111827);
  --se-text-secondary: var(--dw-text-secondary, #6b7280);
  --se-text-muted: var(--dw-text-muted, #9ca3af);
}

.sql-settings-shell--page .panel-nav {
  width: 64px;
}

.sql-settings-shell--page .nav-item {
  min-height: 48px;
}

.sql-settings-shell--page .nav-label {
  font-size: 10px;
}

.panel-shell {
  display: flex;
  flex: 1;
  min-height: 0;
}

.panel-nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 54px;
  flex-shrink: 0;
  padding: 6px 4px;
  border-right: 1px solid var(--se-border);
  background: color-mix(in srgb, var(--se-bg-muted) 50%, var(--se-bg));
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  min-height: 44px;
  padding: 4px 2px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--se-text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.nav-item:hover {
  color: var(--se-text-secondary);
  background: var(--se-bg-hover);
}

.nav-item.active {
  color: var(--se-accent);
  background: color-mix(in srgb, var(--se-accent) 14%, var(--se-bg));
  border-color: color-mix(in srgb, var(--se-accent) 28%, transparent);
  box-shadow: inset 2px 0 0 var(--se-accent);
}

.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.nav-label {
  max-width: 100%;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  word-break: break-word;
}

.panel-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.panel-section-head {
  padding: 6px 10px 4px;
  border-bottom: 1px solid var(--se-border);
  font-size: 11px;
  font-weight: 700;
  color: var(--se-text);
  background: color-mix(in srgb, var(--se-bg-muted) 35%, var(--se-bg));
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  padding: 0 8px 0 10px;
  border-bottom: 1px solid var(--se-border);
  background: color-mix(in srgb, var(--se-bg-muted) 55%, var(--se-bg));
}

.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.panel-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.config-badge {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
  color: var(--se-text-muted);
  background: var(--se-bg-muted);
  border: 1px solid var(--se-border);
  white-space: nowrap;
}

.config-badge.custom {
  color: var(--se-accent);
  background: color-mix(in srgb, var(--se-accent) 12%, var(--se-bg));
  border-color: color-mix(in srgb, var(--se-accent) 24%, transparent);
}

.panel-close {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--se-text-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.panel-close:hover {
  color: var(--se-text);
  background: var(--se-bg-hover);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--se-text-muted) 35%, transparent) transparent;
}

.panel-body::-webkit-scrollbar {
  width: 6px;
}

.panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.panel-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--se-text-muted) 32%, transparent);
}

.panel-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--se-text-muted) 52%, transparent);
}

.panel-foot {
  padding: 6px 8px;
  border-top: 1px solid var(--se-border);
  background: color-mix(in srgb, var(--se-bg-muted) 45%, var(--se-bg));
}

.btn-reset {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--se-danger) 28%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--se-danger) 6%, var(--se-bg));
  color: color-mix(in srgb, var(--se-danger) 82%, var(--se-text));
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.btn-reset:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-reset:hover:not(:disabled) {
  background: color-mix(in srgb, var(--se-danger) 12%, var(--se-bg));
}

.sql-settings-shell.is-confirming .panel-head,
.sql-settings-shell.is-confirming .panel-shell,
.sql-settings-shell.is-confirming .panel-foot {
  pointer-events: none;
  user-select: none;
}

.panel-confirm {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 14px;
  background: color-mix(in srgb, var(--se-bg) 82%, transparent);
  backdrop-filter: blur(4px);
}

.confirm-text {
  margin: 0;
  max-width: 220px;
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
  color: var(--se-text);
}

.confirm-actions {
  display: flex;
  gap: 6px;
  width: 100%;
}

.btn-ghost,
.btn-danger-solid {
  flex: 1;
  min-height: 26px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.btn-ghost {
  border: 1px solid var(--se-border);
  background: var(--se-bg-muted);
  color: var(--se-text-secondary);
}

.btn-ghost:hover {
  background: var(--se-bg-hover);
  color: var(--se-text);
}

.btn-danger-solid {
  border: 1px solid color-mix(in srgb, var(--se-danger) 45%, transparent);
  background: color-mix(in srgb, var(--se-danger) 88%, #000);
  color: #fff;
}

.btn-danger-solid:hover {
  background: var(--se-danger);
}
</style>
