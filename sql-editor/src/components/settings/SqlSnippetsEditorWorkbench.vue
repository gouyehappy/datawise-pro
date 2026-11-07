<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {DwSplitPane} from '@/core/components'
import {
  type SqlEditorShortcutsController,
} from '@sql-editor/composables/useSqlEditorShortcutsController'
import {useSettingsSnippetEditor} from '@sql-editor/composables/useSettingsSnippetEditor'
import {useCompletionSlotLabel} from '@sql-editor/composables/useCompletionSlotLabel'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import {
  groupItemsByCompletionSlot,
  resolvePrimaryCompletionSlot,
  SQL_COMPLETION_SLOT_ORDER,
} from '@sql-editor/constants/completion-slots'
import {filterRedundantGlobalSnippetsForDisplay} from '@sql-editor/config/snippets/merge'
import SettingsSnippetForm from '@sql-editor/components/settings/SettingsSnippetForm.vue'
import SettingsSlotChip from '@sql-editor/components/settings/SettingsSlotChip.vue'
import type {SqlSnippetConfig} from '@sql-editor/types'

const props = withDefaults(
    defineProps<{
      controller: SqlEditorShortcutsController
      readonly?: boolean
      newSnippetSignal?: number
    }>(),
    {
      readonly: false,
      newSnippetSignal: 0,
    },
)

const emit = defineEmits<{
  saved: []
}>()

const {t} = useSqlEditorI18n()
const {slotLabel} = useCompletionSlotLabel()

const saveFlash = ref(false)
let saveFlashTimer: ReturnType<typeof setTimeout> | null = null

function flashSaved() {
  saveFlash.value = true
  if (saveFlashTimer) clearTimeout(saveFlashTimer)
  saveFlashTimer = setTimeout(() => {
    saveFlash.value = false
    saveFlashTimer = null
  }, 1600)
  emit('saved')
}

onBeforeUnmount(() => {
  if (saveFlashTimer) clearTimeout(saveFlashTimer)
})

const {
  settings,
  toggleSnippet,
  upsertPersonalSnippet,
  addCustomSnippet,
  removePersonalSnippet,
  hasSnippetOverride,
  isCustomSnippetId,
} = props.controller

const snippets = computed(() =>
    filterRedundantGlobalSnippetsForDisplay(settings.value.snippets),
)

const {
  expandedId,
  showAddForm,
  draft,
  newDraft,
  toggle,
  close,
  save,
  remove,
  submitNew,
} = useSettingsSnippetEditor({
  snippets,
  addCustomSnippet,
  upsertPersonalSnippet,
  removePersonalSnippet,
  hasSnippetOverride,
})

const searchQuery = ref('')

const groupedBySlot = computed(() =>
    groupItemsByCompletionSlot(
        snippets.value,
        (item) => resolvePrimaryCompletionSlot(item.slots),
        (a, b) => a.label.localeCompare(b.label),
    ),
)

const filteredGroups = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return groupedBySlot.value

  return groupedBySlot.value
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
            item.label.toLowerCase().includes(query)
            || item.detail.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.items.length > 0)
})

const snippetCount = computed(() => snippets.value.length)
const visibleSnippetCount = computed(() =>
    filteredGroups.value.reduce((sum, group) => sum + group.items.length, 0),
)

const selectedSnippet = computed(() =>
    snippets.value.find((item) => item.id === expandedId.value) ?? null,
)

const editingNew = computed(() => showAddForm.value && !expandedId.value)
const hasEditorOpen = computed(() => editingNew.value || !!selectedSnippet.value)

function selectSnippet(item: SqlSnippetConfig) {
  showAddForm.value = false
  toggle(item)
}

function startNewSnippet() {
  if (props.readonly) return
  close()
  newDraft.label = ''
  newDraft.insertText = ''
  newDraft.detail = ''
  newDraft.slot = 'statement_start'
  showAddForm.value = true
}

watch(
    () => props.newSnippetSignal,
    (signal, previous) => {
      if (signal > 0 && signal !== previous) {
        startNewSnippet()
      }
    },
)

function closeEditor() {
  showAddForm.value = false
  close()
}

function cancelEditing() {
  if (showAddForm.value) {
    showAddForm.value = false
    return
  }
  close()
}

function applyEditing() {
  if (props.readonly) return
  if (showAddForm.value) {
    const before = showAddForm.value
    submitNew()
    // submitNew 成功会关掉新建表单
    if (before && !showAddForm.value) flashSaved()
    return
  }
  save()
  flashSaved()
}

function onToggleEnabled(item: SqlSnippetConfig, enabled: boolean) {
  if (props.readonly) return
  toggleSnippet(item.id, enabled)
}

function onRemoveCurrent() {
  if (props.readonly || !expandedId.value) return
  remove()
}

defineExpose({
  startNewSnippet,
  closeEditor,
})
</script>

<template>
  <DwSplitPane
      class="snippets-workbench"
      storage-key="dw.split.settings-sql-snippets"
      default-ratio="half"
      :default-width="420"
      :min-width="280"
      :max-width="720"
      :end-min-width="300"
      :stack-below="900"
      start-class="snippets-list-card setting-card"
      end-class="snippets-editor-card setting-card"
  >
    <template #start>
      <header class="snippets-card__head">
        <div class="snippets-card__head-copy">
          <h3>{{ t('settings.snippets_browse_title') }}</h3>
          <p>{{ t('settings.snippets_browse_hint') }}</p>
        </div>
        <span class="count-badge">
          {{ visibleSnippetCount }}
          <template v-if="searchQuery.trim()">/ {{ snippetCount }}</template>
        </span>
      </header>

      <div class="snippets-list-card__search">
        <input
            v-model="searchQuery"
            type="search"
            class="dw-input dw-input--sm"
            :placeholder="t('settings.snippets_search')"
            autocomplete="off"
            spellcheck="false"
        />
      </div>

      <div class="snippets-list-card__body" role="tree">
        <p v-if="filteredGroups.length === 0" class="snippets-no-results">
          {{ t('settings.snippets_no_results') }}
        </p>

        <section
            v-for="group in filteredGroups"
            :key="group.slot"
            class="snippets-slot-group"
        >
          <header class="snippets-slot-head">
            <SettingsSlotChip :slot="group.slot" :label="slotLabel(group.slot)"/>
            <span class="count-badge">{{ group.items.length }}</span>
          </header>

          <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              role="treeitem"
              class="snippets-row"
              :class="{
                'is-active': expandedId === item.id,
                'is-disabled': !item.enabled,
              }"
              @click="selectSnippet(item)"
          >
            <span class="snippets-row__label mono">{{ item.label }}</span>
            <span v-if="item.detail" class="snippets-row__desc">{{ item.detail }}</span>
            <span v-else class="snippets-row__desc">&nbsp;</span>
            <span
                v-if="hasSnippetOverride(item.id)"
                class="snippets-row__dot"
                :title="isCustomSnippetId(item.id) ? t('settings.keywords_custom_badge') : t('settings.snippets_override')"
            />
          </button>
        </section>
      </div>
    </template>

    <template #end>
      <template v-if="hasEditorOpen">
        <header class="snippets-card__head">
          <div class="snippets-card__head-copy">
            <h3 v-if="editingNew">{{ t('settings.snippets_add') }}</h3>
            <h3 v-else-if="selectedSnippet" class="mono">{{ selectedSnippet.label }}</h3>
            <p>{{ editingNew ? t('settings.snippets_tab_hint') : selectedSnippet?.detail || t('settings.snippets_tab_hint') }}</p>
          </div>
          <div class="snippets-card__actions">
            <button type="button" class="config-btn" @click="cancelEditing">
              {{ t('settings.reset_cancel') }}
            </button>
            <button
                v-if="selectedSnippet && hasSnippetOverride(selectedSnippet.id) && !editingNew"
                type="button"
                class="config-btn"
                :disabled="readonly"
                @click="onRemoveCurrent"
            >
              {{ isCustomSnippetId(selectedSnippet.id) ? t('settings.snippets_delete') : t('settings.keywords_restore') }}
            </button>
            <button
                type="button"
                class="config-btn config-btn--primary"
                :class="{'config-btn--saved': saveFlash}"
                :disabled="readonly || saveFlash"
                @click="applyEditing"
            >
              {{ saveFlash ? t('settings.snippets_saved') : t('settings.snippets_save') }}
            </button>
          </div>
        </header>

        <div
            v-if="selectedSnippet && !editingNew"
            class="snippets-editor-card__meta"
        >
          <label class="snippets-switch">
            <input
                type="checkbox"
                :checked="selectedSnippet.enabled"
                :disabled="readonly"
                @change="onToggleEnabled(selectedSnippet, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t('settings.snippets_enabled') }}</span>
          </label>
          <SettingsSlotChip
              :slot="resolvePrimaryCompletionSlot(selectedSnippet.slots)"
              :label="slotLabel(resolvePrimaryCompletionSlot(selectedSnippet.slots))"
          />
          <span
              v-if="hasSnippetOverride(selectedSnippet.id)"
              class="snippets-override-badge"
          >
            {{ isCustomSnippetId(selectedSnippet.id) ? t('settings.keywords_custom_badge') : t('settings.snippets_override') }}
          </span>
        </div>

        <div class="snippets-editor-card__body">
          <SettingsSnippetForm
              v-if="editingNew"
              compact
              fill-height
              :label="newDraft.label"
              :insert-text="newDraft.insertText"
              :detail="newDraft.detail"
              :insert-rows="5"
              :insert-placeholder="t('settings.snippets_insert_placeholder')"
              @update:label="newDraft.label = $event"
              @update:insert-text="newDraft.insertText = $event"
              @update:detail="newDraft.detail = $event"
          >
            <template #meta-extra>
              <label class="dw-field">
                <span class="dw-field__label">{{ t('settings.snippets_context') }}</span>
                <select
                    v-model="newDraft.slot"
                    class="dw-input"
                >
                  <option v-for="slot in SQL_COMPLETION_SLOT_ORDER" :key="slot" :value="slot">
                    {{ slotLabel(slot) }}
                  </option>
                </select>
              </label>
            </template>
          </SettingsSnippetForm>

          <SettingsSnippetForm
              v-else-if="selectedSnippet"
              compact
              fill-height
              :label="draft.label"
              :insert-text="draft.insertText"
              :detail="draft.detail"
              :insert-rows="5"
              :insert-placeholder="t('settings.snippets_insert_placeholder')"
              @update:label="draft.label = $event"
              @update:insert-text="draft.insertText = $event"
              @update:detail="draft.detail = $event"
          />
        </div>
      </template>

      <div v-else class="snippets-editor-card__empty">
        <div class="snippets-editor-card__empty-icon" aria-hidden="true">&lt;/&gt;</div>
        <h3>{{ t('settings.snippets_pick_one') }}</h3>
        <p>{{ t('settings.snippets_empty_hint') }}</p>
        <button
            type="button"
            class="config-btn config-btn--primary"
            :disabled="readonly"
            @click="startNewSnippet"
        >
          + {{ t('settings.snippets_add') }}
        </button>
      </div>
    </template>
  </DwSplitPane>
</template>
