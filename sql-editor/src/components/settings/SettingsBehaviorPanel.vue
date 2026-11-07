<script setup lang="ts">
import {computed, ref} from 'vue'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import {
  SQL_EDITOR_FONT_SIZE_MAX,
  SQL_EDITOR_FONT_SIZE_MIN,
} from '@sql-editor/config/formatter-settings'
import type {
  ResolvedSqlEditorFormatterSettings,
  SqlEditorFormatterSettings
} from '@sql-editor/config/formatter-settings'
import type {
  SqlEditorAiSettings,
  SqlEditorLocale,
  SqlEditorShortcutsSettings,
  SqlEditorThemeOption
} from '@sql-editor/types'
import {DEFAULT_SQL_EDITOR_AI_MODEL, resolveSqlEditorAiSettings} from '@sql-editor/ai/settings'

type CaseValue = 'upper' | 'lower' | 'preserve'

const props = defineProps<{
  settings: SqlEditorShortcutsSettings
  formatterSettings: ResolvedSqlEditorFormatterSettings
  effectiveFontSize: number
  editorTheme?: string
  themeOptions?: SqlEditorThemeOption[]
}>()

const emit = defineEmits<{
  patchSettings: [patch: Partial<SqlEditorShortcutsSettings>]
  patchFormatter: [patch: Partial<SqlEditorFormatterSettings>]
  setTheme: [theme: string]
}>()

const {t} = useSqlEditorI18n()
const advancedOpen = ref(false)

const localeOptions: { id: SqlEditorLocale; label: string }[] = [
  {id: 'zh-CN', label: '中文'},
  {id: 'en', label: 'EN'},
]

const caseOptions: { id: CaseValue; labelKey: string }[] = [
  {id: 'upper', labelKey: 'settings.formatter_keyword_upper'},
  {id: 'lower', labelKey: 'settings.formatter_keyword_lower'},
  {id: 'preserve', labelKey: 'settings.formatter_keyword_preserve'},
]

function onFontSizeInput(event: Event) {
  emit('patchSettings', {fontSize: Number((event.target as HTMLInputElement).value)})
}

const aiSettings = computed(() => resolveSqlEditorAiSettings(props.settings.ai))
const hintBarOn = computed(() => props.settings.showHintBar !== false)

function patchAi(patch: Partial<SqlEditorAiSettings>) {
  emit('patchSettings', {
    ai: {...(props.settings.ai ?? {}), ...patch},
  })
}
</script>

<template>
  <section class="bh">
    <!-- 上下文提示条 -->
    <div class="bh-group">
      <header class="bh-group-head">
        <span class="bh-group-title">{{ t('settings.behavior_group_hint_bar') }}</span>
      </header>

      <label class="bh-row" :title="t('settings.show_hint_bar_hint')">
        <span class="bh-row-label">{{ t('settings.show_hint_bar') }}</span>
        <span class="bh-switch">
          <input
              type="checkbox"
              :checked="hintBarOn"
              @change="emit('patchSettings', { showHintBar: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>

      <label
          class="bh-row"
          :class="{ 'bh-group-dim': !hintBarOn }"
          :title="t('settings.show_quick_chips_hint')"
      >
        <span class="bh-row-label">{{ t('settings.show_quick_chips') }}</span>
        <span class="bh-switch">
          <input
              type="checkbox"
              :checked="settings.showHintQuickChips !== false"
              :disabled="!hintBarOn"
              @change="emit('patchSettings', { showHintQuickChips: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>
    </div>

    <!-- 补全 -->
    <div class="bh-group">
      <header class="bh-group-head">
        <span class="bh-group-title">{{ t('settings.behavior_group_completion') }}</span>
      </header>

      <label class="bh-row" :title="t('settings.auto_table_alias_hint')">
        <span class="bh-row-label">{{ t('settings.auto_table_alias') }}</span>
        <span class="bh-switch">
          <input
              type="checkbox"
              :checked="settings.autoTableAlias"
              @change="emit('patchSettings', { autoTableAlias: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>

      <label class="bh-row" :title="t('settings.show_suggest_details_hint')">
        <span class="bh-row-label">{{ t('settings.show_suggest_details') }}</span>
        <span class="bh-switch">
          <input
              type="checkbox"
              :checked="settings.showSuggestDetails !== false"
              @change="emit('patchSettings', { showSuggestDetails: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>

      <label class="bh-row" :title="t('settings.show_column_comment_in_suggest_hint')">
        <span class="bh-row-label">{{ t('settings.show_column_comment_in_suggest') }}</span>
        <span class="bh-switch">
          <input
              type="checkbox"
              :checked="settings.showColumnCommentInSuggest === true"
              @change="emit('patchSettings', { showColumnCommentInSuggest: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>
    </div>

    <!-- 编辑辅助 -->
    <div class="bh-group">
      <header class="bh-group-head">
        <span class="bh-group-title">{{ t('settings.behavior_group_editor_chrome') }}</span>
      </header>

      <label class="bh-row" :title="t('settings.show_run_gutter_hint')">
        <span class="bh-row-label">{{ t('settings.show_run_gutter') }}</span>
        <span class="bh-switch">
          <input
              type="checkbox"
              :checked="settings.showRunGutterButton !== false"
              @change="emit('patchSettings', { showRunGutterButton: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>
    </div>

    <!-- 显示 -->
    <div class="bh-group">
      <header class="bh-group-head">
        <span class="bh-group-title">{{ t('settings.behavior_group_appearance') }}</span>
      </header>

      <div
          v-if="themeOptions?.length && editorTheme"
          class="bh-row bh-row-compact bh-row-select"
          :title="t('settings.editor_theme_hint')"
      >
        <span class="bh-row-label">{{ t('settings.editor_theme') }}</span>
        <div class="bh-seg" role="group">
          <button
              v-for="opt in themeOptions"
              :key="opt.id"
              type="button"
              class="bh-seg-btn bh-seg-btn-theme"
              :class="{ on: editorTheme === opt.id }"
              @click="emit('setTheme', opt.id)"
          >{{ opt.label }}
          </button>
        </div>
      </div>

      <div class="bh-row bh-row-stack" :title="t('settings.font_size_hint')">
        <div class="bh-row-top">
          <span class="bh-row-label">{{ t('settings.font_size') }}</span>
          <span class="bh-mono bh-value">{{ effectiveFontSize }}px</span>
        </div>
        <input
            type="range"
            class="bh-range"
            :min="SQL_EDITOR_FONT_SIZE_MIN"
            :max="SQL_EDITOR_FONT_SIZE_MAX"
            step="1"
            :value="effectiveFontSize"
            @input="onFontSizeInput"
        />
        <div class="bh-range-marks">
          <span>{{ SQL_EDITOR_FONT_SIZE_MIN }}</span>
          <span>{{ SQL_EDITOR_FONT_SIZE_MAX }}</span>
        </div>
      </div>

      <label class="bh-row" :title="t('settings.folding_hint')">
        <span class="bh-row-label">{{ t('settings.folding') }}</span>
        <span class="bh-switch">
          <input
              type="checkbox"
              :checked="settings.folding !== false"
              @change="emit('patchSettings', { folding: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>

      <div class="bh-row bh-row-compact bh-row-select" :title="t('settings.ui_language_hint')">
        <span class="bh-row-label">{{ t('settings.ui_language') }}</span>
        <div class="bh-seg" role="group">
          <button
              v-for="opt in localeOptions"
              :key="opt.id"
              type="button"
              class="bh-seg-btn bh-seg-btn-locale"
              :class="{ on: settings.locale === opt.id }"
              @click="emit('patchSettings', { locale: opt.id })"
          >{{ opt.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- AI -->
    <div class="bh-group">
      <header class="bh-group-head bh-group-head-split">
        <span class="bh-group-title">{{ t('settings.ai_group') }}</span>
        <label class="bh-switch bh-switch-sm" :title="t('settings.ai_enabled_hint')">
          <input
              type="checkbox"
              :checked="aiSettings.enabled === true"
              @change="patchAi({ enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </label>
      </header>

      <p class="bh-note">{{ t('settings.ai_note') }}</p>

      <div class="bh-row bh-row-stack" :class="{ 'bh-group-dim': !aiSettings.enabled }">
        <span class="bh-row-label">{{ t('settings.ai_base_url') }}</span>
        <input
            type="url"
            class="bh-field"
            :value="aiSettings.baseUrl"
            :placeholder="t('settings.ai_base_url_placeholder')"
            :disabled="!aiSettings.enabled"
            @change="patchAi({ baseUrl: ($event.target as HTMLInputElement).value.trim() })"
        />
      </div>

      <div class="bh-row bh-row-stack" :class="{ 'bh-group-dim': !aiSettings.enabled }">
        <span class="bh-row-label">{{ t('settings.ai_api_key') }}</span>
        <input
            type="password"
            class="bh-field"
            :value="aiSettings.apiKey"
            :placeholder="t('settings.ai_api_key_placeholder')"
            autocomplete="off"
            :disabled="!aiSettings.enabled"
            @change="patchAi({ apiKey: ($event.target as HTMLInputElement).value.trim() })"
        />
      </div>

      <div class="bh-row bh-row-stack" :class="{ 'bh-group-dim': !aiSettings.enabled }">
        <span class="bh-row-label">{{ t('settings.ai_model') }}</span>
        <input
            type="text"
            class="bh-field"
            :value="aiSettings.model"
            :placeholder="DEFAULT_SQL_EDITOR_AI_MODEL"
            :disabled="!aiSettings.enabled"
            @change="patchAi({ model: ($event.target as HTMLInputElement).value.trim() })"
        />
      </div>

      <label class="bh-row" :class="{ 'bh-group-dim': !aiSettings.enabled }"
             :title="t('settings.ai_completion_enabled_hint')">
        <span class="bh-row-label">{{ t('settings.ai_completion_enabled') }}</span>
        <span class="bh-switch">
          <input
              type="checkbox"
              :checked="aiSettings.completionEnabled !== false"
              :disabled="!aiSettings.enabled"
              @change="patchAi({ completionEnabled: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>
    </div>

    <!-- 格式化（边写边断行与库格式化独立，不受 useLibrary 灰显影响） -->
    <div class="bh-group">
      <header class="bh-group-head">
        <span class="bh-group-title">{{ t('settings.formatter_section') }}</span>
      </header>

      <label class="bh-row" :title="t('settings.formatter_as_you_type_hint')">
        <span class="bh-row-label">{{ t('settings.formatter_as_you_type') }}</span>
        <span class="bh-switch bh-switch-sm">
          <input
              type="checkbox"
              :checked="formatterSettings.formatAsYouType"
              @change="emit('patchFormatter', { formatAsYouType: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>

      <label class="bh-row" :title="t('settings.formatter_use_library_hint')">
        <span class="bh-row-label">{{ t('settings.formatter_use_library') }}</span>
        <span class="bh-switch bh-switch-sm">
          <input
              type="checkbox"
              :checked="formatterSettings.useLibrary"
              @change="emit('patchFormatter', { useLibrary: ($event.target as HTMLInputElement).checked })"
          />
          <span class="bh-switch-track" aria-hidden="true"/>
        </span>
      </label>

      <div class="bh-grid" :class="{ 'bh-group-dim': !formatterSettings.useLibrary }">
        <div class="bh-cell" :title="t('settings.formatter_keyword_case_hint')">
          <span class="bh-cell-label">{{ t('settings.formatter_keyword_case') }}</span>
          <div class="bh-seg" role="group">
            <button
                v-for="opt in caseOptions"
                :key="`kw-${opt.id}`"
                type="button"
                class="bh-seg-btn"
                :class="{ on: formatterSettings.keywordCase === opt.id }"
                :disabled="!formatterSettings.useLibrary"
                @click="emit('patchFormatter', { keywordCase: opt.id })"
            >{{ t(opt.labelKey) }}
            </button>
          </div>
        </div>

        <div class="bh-cell" :title="t('settings.formatter_tab_width_hint')">
          <span class="bh-cell-label">{{ t('settings.formatter_tab_width') }}</span>
          <div class="bh-seg" role="group">
            <button
                v-for="n in [2, 4] as const"
                :key="`tab-${n}`"
                type="button"
                class="bh-seg-btn bh-seg-btn-num"
                :class="{ on: formatterSettings.tabWidth === n }"
                :disabled="!formatterSettings.useLibrary"
                @click="emit('patchFormatter', { tabWidth: n })"
            >{{ n }}
            </button>
          </div>
        </div>

        <div class="bh-cell" :title="t('settings.formatter_lines_between_hint')">
          <span class="bh-cell-label">{{ t('settings.formatter_lines_between') }}</span>
          <div class="bh-seg" role="group">
            <button
                v-for="n in [1, 2] as const"
                :key="`gap-${n}`"
                type="button"
                class="bh-seg-btn bh-seg-btn-num"
                :class="{ on: formatterSettings.linesBetweenQueries === n }"
                :disabled="!formatterSettings.useLibrary"
                @click="emit('patchFormatter', { linesBetweenQueries: n })"
            >{{ n }}
            </button>
          </div>
        </div>

        <div class="bh-cell" :title="t('settings.formatter_identifier_case_hint')">
          <span class="bh-cell-label">{{ t('settings.formatter_identifier_case') }}</span>
          <div class="bh-seg" role="group">
            <button
                v-for="opt in caseOptions"
                :key="`id-${opt.id}`"
                type="button"
                class="bh-seg-btn"
                :class="{ on: formatterSettings.identifierCase === opt.id }"
                :disabled="!formatterSettings.useLibrary"
                @click="emit('patchFormatter', { identifierCase: opt.id })"
            >{{ t(opt.labelKey) }}
            </button>
          </div>
        </div>

        <div class="bh-cell" :title="t('settings.formatter_function_case_hint')">
          <span class="bh-cell-label">{{ t('settings.formatter_function_case') }}</span>
          <div class="bh-seg" role="group">
            <button
                v-for="opt in caseOptions"
                :key="`fn-${opt.id}`"
                type="button"
                class="bh-seg-btn"
                :class="{ on: formatterSettings.functionCase === opt.id }"
                :disabled="!formatterSettings.useLibrary"
                @click="emit('patchFormatter', { functionCase: opt.id })"
            >{{ t(opt.labelKey) }}
            </button>
          </div>
        </div>

        <div class="bh-cell" :title="t('settings.formatter_logical_newline_hint')">
          <span class="bh-cell-label">{{ t('settings.formatter_logical_newline') }}</span>
          <div class="bh-seg" role="group">
            <button
                type="button"
                class="bh-seg-btn"
                :class="{ on: formatterSettings.logicalOperatorNewline === 'before' }"
                :disabled="!formatterSettings.useLibrary"
                @click="emit('patchFormatter', { logicalOperatorNewline: 'before' })"
            >{{ t('settings.formatter_logical_before') }}
            </button>
            <button
                type="button"
                class="bh-seg-btn"
                :class="{ on: formatterSettings.logicalOperatorNewline === 'after' }"
                :disabled="!formatterSettings.useLibrary"
                @click="emit('patchFormatter', { logicalOperatorNewline: 'after' })"
            >{{ t('settings.formatter_logical_after') }}
            </button>
          </div>
        </div>
      </div>

      <button
          type="button"
          class="bh-advanced-toggle"
          :aria-expanded="advancedOpen"
          @click="advancedOpen = !advancedOpen"
      >
        <span>{{ t('settings.formatter_advanced') }}</span>
        <svg class="bh-chevron" :class="{ open: advancedOpen }" viewBox="0 0 12 12" width="10" height="10">
          <path fill="currentColor" d="M3 4.5 6 7.5 9 4.5"/>
        </svg>
      </button>

      <div v-show="advancedOpen" class="bh-advanced">
        <label class="bh-row bh-row-compact" :title="t('settings.formatter_use_tabs_hint')">
          <span class="bh-row-label">{{ t('settings.formatter_use_tabs') }}</span>
          <span class="bh-switch bh-switch-sm">
            <input
                type="checkbox"
                :checked="formatterSettings.useTabs"
                :disabled="!formatterSettings.useLibrary"
                @change="emit('patchFormatter', { useTabs: ($event.target as HTMLInputElement).checked })"
            />
            <span class="bh-switch-track" aria-hidden="true"/>
          </span>
        </label>

        <div class="bh-row bh-row-compact bh-row-select" :title="t('settings.formatter_indent_style_hint')">
          <span class="bh-row-label">{{ t('settings.formatter_indent_style') }}</span>
          <select
              class="bh-select"
              :value="formatterSettings.indentStyle"
              :disabled="!formatterSettings.useLibrary"
              @change="emit('patchFormatter', { indentStyle: ($event.target as HTMLSelectElement).value as 'standard' | 'tabularLeft' | 'tabularRight' })"
          >
            <option value="standard">{{ t('settings.formatter_indent_standard') }}</option>
            <option value="tabularLeft">{{ t('settings.formatter_indent_tabular_left') }}</option>
            <option value="tabularRight">{{ t('settings.formatter_indent_tabular_right') }}</option>
          </select>
        </div>

        <label class="bh-row bh-row-compact" :title="t('settings.formatter_dense_operators_hint')">
          <span class="bh-row-label">{{ t('settings.formatter_dense_operators') }}</span>
          <span class="bh-switch bh-switch-sm">
            <input
                type="checkbox"
                :checked="formatterSettings.denseOperators"
                :disabled="!formatterSettings.useLibrary"
                @change="emit('patchFormatter', { denseOperators: ($event.target as HTMLInputElement).checked })"
            />
            <span class="bh-switch-track" aria-hidden="true"/>
          </span>
        </label>

        <label class="bh-row bh-row-compact" :title="t('settings.formatter_semicolon_newline_hint')">
          <span class="bh-row-label">{{ t('settings.formatter_semicolon_newline') }}</span>
          <span class="bh-switch bh-switch-sm">
            <input
                type="checkbox"
                :checked="formatterSettings.newlineBeforeSemicolon"
                :disabled="!formatterSettings.useLibrary"
                @change="emit('patchFormatter', { newlineBeforeSemicolon: ($event.target as HTMLInputElement).checked })"
            />
            <span class="bh-switch-track" aria-hidden="true"/>
          </span>
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bh {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bh-group {
  border-radius: 8px;
  border: 1px solid var(--se-border);
  background: color-mix(in srgb, var(--se-bg-muted) 28%, var(--se-bg));
  overflow: hidden;
  transition: opacity 0.15s;
}

/* Applied on the dimmed node itself (row / grid / advanced block). */
.bh-group-dim {
  opacity: 0.55;
}

.bh-group-head {
  padding: 6px 10px 5px;
  border-bottom: 1px solid color-mix(in srgb, var(--se-border) 65%, transparent);
}

.bh-group-head-split {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bh-group-title {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--se-text-muted);
}

.bh-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
  padding: 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--se-border) 50%, transparent);
  cursor: pointer;
}

.bh-row:last-child {
  border-bottom: none;
}

.bh-row-compact {
  min-height: 28px;
  cursor: default;
}

.bh-row-select {
  cursor: default;
}

.bh-row-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px 10px 10px;
  cursor: default;
}

.bh-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bh-row-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--se-text);
  line-height: 1.3;
}

.bh-mono {
  font-family: ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace;
}

.bh-value {
  font-size: 10px;
  font-weight: 600;
  color: var(--se-accent);
}

.bh-range {
  width: 100%;
  height: 4px;
  margin: 0;
  accent-color: var(--se-accent, #3b82f6);
  cursor: pointer;
}

.bh-range-marks {
  display: flex;
  justify-content: space-between;
  font-size: 8px;
  color: var(--se-text-muted);
  opacity: 0.75;
}

.bh-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.bh-cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--se-border) 45%, transparent);
}

.bh-cell-label {
  font-size: 10px;
  color: var(--se-text-secondary);
  line-height: 1.25;
}

.bh-seg {
  display: inline-flex;
  padding: 2px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--se-bg-hover) 80%, var(--se-bg));
  border: 1px solid color-mix(in srgb, var(--se-border) 80%, transparent);
}

.bh-seg-btn {
  min-width: 0;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--se-text-muted);
  font-size: 9px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.bh-seg-btn-num {
  min-width: 22px;
  padding: 2px 0;
  text-align: center;
  font-family: ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace;
}

.bh-seg-btn-locale {
  min-width: 36px;
  padding: 2px 8px;
}

.bh-seg-btn-theme {
  min-width: 40px;
  padding: 2px 10px;
}

.bh-seg-btn:hover:not(:disabled) {
  color: var(--se-text);
}

.bh-seg-btn.on {
  background: var(--se-bg);
  color: var(--se-accent);
  box-shadow: 0 1px 2px color-mix(in srgb, #000 12%, transparent);
}

.bh-seg-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bh-advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--se-border) 50%, transparent);
  background: color-mix(in srgb, var(--se-bg-muted) 35%, transparent);
  color: var(--se-text-muted);
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.bh-advanced-toggle:hover {
  color: var(--se-text-secondary);
  background: var(--se-bg-hover);
}

.bh-chevron {
  transition: transform 0.15s ease;
}

.bh-chevron.open {
  transform: rotate(180deg);
}

.bh-advanced {
  border-top: 1px solid color-mix(in srgb, var(--se-border) 45%, transparent);
}

.bh-select {
  max-width: 108px;
  padding: 3px 6px;
  border-radius: 5px;
  border: 1px solid var(--se-border);
  background: var(--se-bg);
  color: var(--se-text);
  font-size: 9px;
  cursor: pointer;
}

.bh-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bh-field {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--se-border);
  background: var(--se-bg);
  color: var(--se-text);
  font-size: 11px;
}

.bh-field:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bh-note {
  margin: 0 0 8px;
  font-size: 10px;
  line-height: 1.45;
  color: var(--se-text-muted, #777);
}

/* Switch */
.bh-switch {
  position: relative;
  flex-shrink: 0;
  width: 30px;
  height: 16px;
}

.bh-switch-sm {
  width: 26px;
  height: 14px;
}

.bh-switch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  margin: 0;
}

.bh-switch-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--se-bg-hover);
  border: 1px solid var(--se-border);
  transition: background 0.15s, border-color 0.15s;
}

.bh-switch-track::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--se-text-muted);
  transition: transform 0.15s, background 0.15s;
}

.bh-switch-sm .bh-switch-track::after {
  width: 10px;
  height: 10px;
}

.bh-switch input:checked + .bh-switch-track {
  background: color-mix(in srgb, var(--se-accent) 22%, transparent);
  border-color: color-mix(in srgb, var(--se-accent) 40%, transparent);
}

.bh-switch input:checked + .bh-switch-track::after {
  transform: translateX(14px);
  background: var(--se-accent);
}

.bh-switch-sm input:checked + .bh-switch-track::after {
  transform: translateX(12px);
}
</style>
