<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {storeToRefs} from 'pinia'
import MonacoEditor from '@/core/components/MonacoEditor.vue'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsTabStrip from '@/features/settings/components/SettingsTabStrip.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import SettingsGroup from '@/features/settings/components/SettingsGroup.vue'
import {DwInput, DwSplitPane, FormField, SettingsRow, SettingsSwitch} from '@/core/components'
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  EDITOR_LINE_HEIGHT_MAX,
  EDITOR_LINE_HEIGHT_MIN,
  EDITOR_PREVIEW_SQL,
  EDITOR_THEME_OPTIONS,
  GRID_PAGE_SIZE_OPTIONS,
  MAX_RESULT_ROWS_MAX,
  MAX_RESULT_ROWS_MIN,
  SLOW_QUERY_THRESHOLD_MAX,
  SLOW_QUERY_THRESHOLD_MIN,
  type EditorSettings,
  type EditorThemeId,
} from '@/features/settings/constants/editor-presets'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'

type EditorTabId = 'appearance' | 'query'

const {t} = useI18n()
const editorSettings = useEditorSettingsStore()
const {settings: editorPrefs} = storeToRefs(editorSettings)
const appConfig = useAppConfigStore()
const layout = useLayoutStore()
const {readOnly: editorReadOnly, hint: editorHint} = useResourceWriteGuard(UserResource.EditorPreferences)
const previewSql = ref(EDITOR_PREVIEW_SQL)
const previewEditorRef = ref<InstanceType<typeof MonacoEditor> | null>(null)

watch(editorPrefs, () => {
  requestAnimationFrame(() => previewEditorRef.value?.layout())
}, {deep: true})

const settingsScrollEl = ref<HTMLElement | null>(null)

const editorTab = ref<EditorTabId>(
  layout.settingsSection === 'querySafety' ? 'query' : 'appearance',
)

watch(
  () => layout.settingsSection,
  (section) => {
    if (section === 'querySafety') editorTab.value = 'query'
    else if (section === 'editor') editorTab.value = 'appearance'
  },
)

const editorTabs = computed(() => [
  {id: 'appearance' as const, label: t('settings.editor.tabAppearance')},
  {id: 'query' as const, label: t('settings.editor.tabQuery')},
])

const pageTitle = computed(() =>
  editorTab.value === 'query' ? t('settings.editor.queryTitle') : t('settings.editor.title'),
)

const pageSubtitle = computed(() =>
  editorTab.value === 'query' ? t('settings.editor.querySubtitle') : t('settings.editor.subtitle'),
)

function onEditorTabChange(value: string) {
  const next = value === 'query' ? 'query' : 'appearance'
  editorTab.value = next
  layout.setSettingsSection(next === 'query' ? 'querySafety' : 'editor')
}

const currentThemeDescription = computed(() =>
    t(`settings.editor.themeDescriptions.${editorSettings.settings.theme}`),
)

const themeOptions = computed(() =>
    EDITOR_THEME_OPTIONS.map((theme) => ({
      value: theme,
      label: t(`settings.editor.themes.${theme}`),
    })),
)

const fontOptions = computed(() =>
    EDITOR_FONT_OPTIONS.map((font) => ({value: font, label: font})),
)

const gridPageSizeOptions = computed(() => [
  {value: '0', label: t('settings.editor.defaultGridPageSizeAuto')},
  ...GRID_PAGE_SIZE_OPTIONS.map((size) => ({
    value: String(size),
    label: t('settings.editor.defaultGridPageSizeValue', {count: size}),
  })),
])

const dangerousSqlPrefs = computed(() => appConfig.dangerousSqlPreferences)

const whitelistTablesText = computed({
  get: () => dangerousSqlPrefs.value.whitelistedTables.join('\n'),
  set: (value: string) => {
    appConfig.patchDangerousSql({
      whitelistedTables: value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
    })
  },
})

function preserveScrollPatch(patch: Partial<EditorSettings>) {
  const scrollRoot = settingsScrollEl.value?.closest('.module-shell__main') as HTMLElement | null
  const scrollTop = scrollRoot?.scrollTop ?? 0
  editorSettings.patchSettings(patch)
  requestAnimationFrame(() => {
    if (scrollRoot) scrollRoot.scrollTop = scrollTop
  })
}

function setFontSize(fontSize: number) {
  if (!Number.isFinite(fontSize)) return
  preserveScrollPatch({
    fontSize: Math.min(EDITOR_FONT_SIZE_MAX, Math.max(EDITOR_FONT_SIZE_MIN, fontSize)),
  })
}

function setLineHeight(lineHeight: number) {
  if (!Number.isFinite(lineHeight)) return
  preserveScrollPatch({
    lineHeight: Math.min(EDITOR_LINE_HEIGHT_MAX, Math.max(EDITOR_LINE_HEIGHT_MIN, lineHeight)),
  })
}

function setMaxResultRows(maxResultRows: number) {
  if (!Number.isFinite(maxResultRows)) return
  preserveScrollPatch({
    maxResultRows: Math.min(MAX_RESULT_ROWS_MAX, Math.max(MAX_RESULT_ROWS_MIN, Math.trunc(maxResultRows))),
  })
}

function setSlowQueryThresholdMs(slowQueryThresholdMs: number) {
  if (!Number.isFinite(slowQueryThresholdMs)) return
  preserveScrollPatch({
    slowQueryThresholdMs: Math.min(
        SLOW_QUERY_THRESHOLD_MAX,
        Math.max(SLOW_QUERY_THRESHOLD_MIN, Math.trunc(slowQueryThresholdMs)),
    ),
  })
}

function setDefaultGridPageSize(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return
  preserveScrollPatch({defaultGridPageSize: Math.trunc(parsed)})
}

function setTheme(theme: string) {
  preserveScrollPatch({theme: theme as EditorThemeId})
}

function setFontFamily(fontFamily: string) {
  preserveScrollPatch({fontFamily})
}

</script>

<template>
  <SettingsPageShell
      class="settings-page--editor"
      :title="pageTitle"
      :subtitle="pageSubtitle"
      :readonly="editorReadOnly"
      :readonly-hint="editorHint"
  >
    <template #tips>
      <SettingsTipsCard
          :title="t('settings.editor.tipsTitle')"
          :content="pageSubtitle"
          icon="settings-editor"
      />
    </template>

    <div ref="settingsScrollEl" class="editor-settings editor-settings--v2">
      <SettingsTabStrip
          :model-value="editorTab"
          :tabs="editorTabs"
          :aria-label="t('settings.nav.groups.editor')"
          @update:model-value="onEditorTabChange"
      />

      <DwSplitPane
          v-if="editorTab === 'appearance'"
          class="editor-settings__layout"
          storage-key="dw.split.settings-editor"
          default-ratio="third"
          :default-width="360"
          :min-width="280"
          :max-width="560"
          :end-min-width="320"
          :stack-below="960"
          start-class="settings-groups editor-settings__main"
          end-class="editor-preview"
      >
        <template #start>
        <SettingsGroup
            :title="t('settings.editor.sectionAppearance')"
            :hint="t('settings.editor.sectionAppearanceHint')"
        >
          <div class="settings-section__block">
            <p class="settings-section__block-label">{{ t('settings.editor.theme') }}</p>
            <div class="theme-grid" role="radiogroup" :aria-label="t('settings.editor.theme')">
              <button
                  v-for="option in themeOptions"
                  :key="option.value"
                  type="button"
                  class="theme-tile"
                  :class="{'is-active': editorSettings.settings.theme === option.value}"
                  role="radio"
                  :aria-checked="editorSettings.settings.theme === option.value"
                  @click="setTheme(option.value)"
              >
                <span class="theme-tile__label">{{ option.label }}</span>
                <span
                    class="theme-tile__swatch"
                    :class="`theme-tile__swatch--${option.value}`"
                    aria-hidden="true"
                />
              </button>
            </div>
            <p class="settings-section__block-hint">{{ currentThemeDescription }}</p>
            <p class="settings-section__block-hint">{{ t('settings.editor.themeNote') }}</p>
          </div>

          <SettingsRow :label="t('settings.editor.fontFamily')">
            <SettingsSelect
                id="editor-font"
                :model-value="editorSettings.settings.fontFamily"
                :options="fontOptions"
                use-option-font
                @update:model-value="setFontFamily"
            />
          </SettingsRow>
          <SettingsRow
              :label="t('settings.editor.fontSize')"
              :hint="t('settings.editor.fontSizeHint')"
          >
            <div class="input-with-unit">
              <DwInput
                  id="editor-font-size"
                  type="number"
                  :min="EDITOR_FONT_SIZE_MIN"
                  :max="EDITOR_FONT_SIZE_MAX"
                  :model-value="editorSettings.settings.fontSize"
                  @update:model-value="setFontSize(Number($event))"
              />
              <span class="unit-chip">px</span>
            </div>
          </SettingsRow>
          <SettingsRow :label="t('settings.editor.lineHeight')">
            <div class="input-with-unit">
              <DwInput
                  id="editor-line-height"
                  type="number"
                  :min="EDITOR_LINE_HEIGHT_MIN"
                  :max="EDITOR_LINE_HEIGHT_MAX"
                  step="0.1"
                  :model-value="editorSettings.settings.lineHeight"
                  @update:model-value="setLineHeight(Number($event))"
              />
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
            :title="t('settings.editor.sectionDisplay')"
            :hint="t('settings.editor.sectionDisplayHint')"
        >
          <SettingsSwitch
              :label="t('settings.editor.lineNumbers')"
              :hint="t('settings.editor.lineNumbersHint')"
              :model-value="editorSettings.settings.lineNumbers"
              @update:model-value="(v) => preserveScrollPatch({lineNumbers: v})"
          />
          <SettingsSwitch
              :label="t('settings.editor.minimap')"
              :hint="t('settings.editor.minimapHint')"
              :model-value="editorSettings.settings.minimap"
              @update:model-value="(v) => preserveScrollPatch({minimap: v})"
          />
          <SettingsSwitch
              :label="t('settings.editor.wordWrap')"
              :hint="t('settings.editor.wordWrapHint')"
              :model-value="editorSettings.settings.wordWrap"
              @update:model-value="(v) => preserveScrollPatch({wordWrap: v})"
          />
          <SettingsSwitch
              :label="t('settings.editor.folding')"
              :hint="t('settings.editor.foldingHint')"
              :model-value="editorSettings.settings.folding"
              @update:model-value="(v) => preserveScrollPatch({folding: v})"
          />
        </SettingsGroup>
        </template>

        <template #end>
          <div class="preview-pane" aria-label="preview">
            <div class="preview-head">
              <span class="preview-dot preview-dot--red"/>
              <span class="preview-dot preview-dot--yellow"/>
              <span class="preview-dot preview-dot--green"/>
              <span class="preview-title">{{ t('settings.editor.preview') }}</span>
            </div>
            <div
                class="preview-editor"
                :class="`preview-editor--${editorPrefs.theme}`"
                tabindex="-1"
            >
              <MonacoEditor
                  ref="previewEditorRef"
                  v-model="previewSql"
                  language="sql"
                  readonly
                  preview
              />
            </div>
          </div>
          <p class="editor-preview__hint">{{ t('settings.editor.previewHint') }}</p>
        </template>
      </DwSplitPane>

      <div v-else class="settings-groups editor-settings__main editor-settings__query">
        <SettingsGroup
            :title="t('settings.editor.sectionQuery')"
            :hint="t('settings.editor.sectionQueryHint')"
        >
          <SettingsRow
              :label="t('settings.editor.maxResultRows')"
              :hint="t('settings.editor.maxResultRowsHint')"
          >
            <div class="input-with-unit">
              <DwInput
                  id="editor-max-result-rows"
                  type="number"
                  :min="MAX_RESULT_ROWS_MIN"
                  :max="MAX_RESULT_ROWS_MAX"
                  step="1"
                  :model-value="editorSettings.settings.maxResultRows"
                  @update:model-value="setMaxResultRows(Number($event))"
              />
              <span v-if="editorSettings.settings.maxResultRows <= 0" class="unit-chip">
                {{ t('settings.editor.maxResultRowsUnlimited') }}
              </span>
            </div>
          </SettingsRow>
          <SettingsRow
              :label="t('settings.editor.slowQueryThresholdMs')"
              :hint="t('settings.editor.slowQueryThresholdMsHint')"
          >
            <div class="input-with-unit">
              <DwInput
                  id="editor-slow-query-threshold"
                  type="number"
                  :min="SLOW_QUERY_THRESHOLD_MIN"
                  :max="SLOW_QUERY_THRESHOLD_MAX"
                  step="100"
                  :model-value="editorSettings.settings.slowQueryThresholdMs"
                  @update:model-value="setSlowQueryThresholdMs(Number($event))"
              />
              <span class="unit-chip">ms</span>
            </div>
          </SettingsRow>
          <SettingsRow
              :label="t('settings.editor.defaultGridPageSize')"
              :hint="t('settings.editor.defaultGridPageSizeHint')"
          >
            <SettingsSelect
                id="editor-default-grid-page-size"
                :model-value="String(editorSettings.settings.defaultGridPageSize)"
                :options="gridPageSizeOptions"
                @update:model-value="setDefaultGridPageSize"
            />
          </SettingsRow>
          <SettingsSwitch
              :label="t('settings.editor.productionPerfMode')"
              :hint="t('settings.editor.productionPerfModeHint')"
              :model-value="editorSettings.settings.productionPerfMode"
              @update:model-value="preserveScrollPatch({ productionPerfMode: $event })"
          />
        </SettingsGroup>

        <SettingsGroup
            :title="t('settings.editor.dangerousSqlTitle')"
            :hint="t('settings.editor.dangerousSqlHint')"
        >
          <SettingsSwitch
              :label="t('settings.editor.dangerousSqlConfirmEnabled')"
              :hint="t('settings.editor.dangerousSqlConfirmEnabledHint')"
              :model-value="dangerousSqlPrefs.confirmEnabled"
              @update:model-value="appConfig.patchDangerousSql({ confirmEnabled: $event })"
          />
          <div class="settings-section__block">
            <FormField
                :label="t('settings.editor.dangerousSqlWhitelist')"
                input-id="editor-danger-sql-whitelist"
            >
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    v-model="whitelistTablesText"
                    class="whitelist-textarea"
                    :rows="4"
                    variant="mono"
                    :placeholder="t('settings.editor.dangerousSqlWhitelistPlaceholder')"
                    :spellcheck="false"
                />
              </template>
            </FormField>
            <p class="settings-section__block-hint">{{ t('settings.editor.dangerousSqlWhitelistHint') }}</p>
          </div>
        </SettingsGroup>
      </div>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
/* color-exception: editor theme preview swatches (One Dark / GitHub Light literal palettes) */
.editor-settings__layout.dw-split-pane {
  gap: var(--dw-space-9);
  align-items: start;
}

.editor-settings--v2 {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-7);
}

:deep(.editor-settings__main) {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-7);
  min-width: 0;
}

.editor-settings__query {
  max-width: 720px;
}

.editor-card__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--dw-space-6);
}

.editor-card__grid--query {
  grid-template-columns: 1fr 1fr;
}

.editor-section--danger {
  border-color: color-mix(in srgb, var(--dw-warning) 28%, var(--dw-panel-border));
}

.editor-field--full {
  grid-column: 1 / -1;
}

.theme-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--dw-gap);
}

.theme-tile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  cursor: pointer;
  transition: var(--dw-transition-colors), box-shadow var(--dw-duration) var(--dw-ease);
}

.theme-tile:hover {
  border-color: color-mix(in srgb, var(--dw-text) 26%, var(--dw-border));
}

.theme-tile.is-active {
  border-color: var(--dw-border-strong, var(--dw-text-secondary));
  background: var(--dw-bg-hover);
  box-shadow: none;
}

.theme-tile__label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.theme-tile__swatch {
  width: 28px;
  height: var(--dw-icon-size-lg);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid var(--dw-panel-border);
}

.theme-tile__swatch--one-dark {
  background: linear-gradient(180deg, #282c34 0%, #1a1b26 100%);
}

.theme-tile__swatch--github-light {
  background: linear-gradient(180deg, var(--dw-on-accent) 0%, var(--dw-bg-muted) 100%);
}

.danger-sql-toggle {
  margin-bottom: var(--dw-space-2);
}

.whitelist-textarea,
:deep(.whitelist-textarea) {
  width: 100%;
  min-height: 96px;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-relaxed);
  resize: vertical;
}

:deep(.editor-preview) {
  position: sticky;
  top: 12px;
  min-width: 0;
}

:deep(.editor-preview) .preview-pane {
  display: flex;
  flex-direction: column;
}

.editor-preview__hint {
  margin: var(--dw-space-4) 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
}

.preview-editor {
  height: clamp(420px, 50vh, 540px);
  padding: var(--dw-space-1);
  contain: layout size;
  overflow: hidden;
}

.preview-editor--one-dark {
  background: #1a1b26;
}

.preview-editor--github-light {
  background: #ffffff;
}

.preview-editor :deep(.monaco-host),
.preview-editor :deep(.sql-editor) {
  height: 100%;
  min-height: 0;
}

.preview-editor :deep(.monaco-host) {
  border-radius: 0 0 var(--dw-panel-radius) var(--dw-panel-radius);
}

@media (max-width: 960px) {
  :deep(.editor-settings__main) {
    max-width: none;
  }

  :deep(.editor-preview) .preview-pane {
    min-height: 0;
  }

  .editor-card__grid,
  .editor-card__grid--query,
  .theme-grid {
    grid-template-columns: 1fr;
  }

  .preview-editor {
    height: 300px;
  }
}
</style>
