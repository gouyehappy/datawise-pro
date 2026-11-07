<script setup lang="ts">
import {onBeforeUnmount, ref} from 'vue'
import {useCompletionSlotLabel} from '@sql-editor/composables/useCompletionSlotLabel'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import SettingsSlotChip from '@sql-editor/components/settings/SettingsSlotChip.vue'
import SettingsSnippetForm from '@sql-editor/components/settings/SettingsSnippetForm.vue'
import {
  SQL_COMPLETION_SLOT_ORDER,
  type SlotGroupedItems,
} from '@sql-editor/constants/completion-slots'
import type {SqlCompletionSlot, SqlSnippetConfig} from '@sql-editor/types'

/** 「片段」标签页：按槽位分组、开关、展开编辑与新建。 */
const props = defineProps<{
  groups: SlotGroupedItems<SqlSnippetConfig>[]
  expandedId: string | null
  showAddForm: boolean
  draft: {
    label: string
    insertText: string
    detail: string
  }
  newDraft: {
    label: string
    insertText: string
    detail: string
    slot: SqlCompletionSlot
  }
  hasSnippetOverride: (id: string) => boolean
  isCustomSnippetId: (id: string) => boolean
}>()

const emit = defineEmits<{
  toggleSnippet: [item: SqlSnippetConfig]
  toggleEnabled: [id: string, enabled: boolean]
  save: []
  remove: []
  toggleAddForm: []
  cancelAdd: []
  submitNew: []
  'update:draft-label': [value: string]
  'update:draft-insertText': [value: string]
  'update:draft-detail': [value: string]
  'update:new-label': [value: string]
  'update:new-insertText': [value: string]
  'update:new-detail': [value: string]
  'update:new-slot': [value: SqlCompletionSlot]
}>()

const {t} = useSqlEditorI18n()
const {slotLabel} = useCompletionSlotLabel()

const saveFlash = ref(false)
let saveFlashTimer: ReturnType<typeof setTimeout> | null = null

function onSaveClick() {
  emit('save')
  saveFlash.value = true
  if (saveFlashTimer) clearTimeout(saveFlashTimer)
  saveFlashTimer = setTimeout(() => {
    saveFlash.value = false
    saveFlashTimer = null
  }, 1600)
}

onBeforeUnmount(() => {
  if (saveFlashTimer) clearTimeout(saveFlashTimer)
})
</script>

<template>
  <section class="panel-section">
    <p class="section-hint">{{ t('settings.snippets_hint') }}</p>
    <p class="section-hint section-hint--usage">{{ t('settings.snippets_usage_hint') }}</p>

    <div v-for="group in groups" :key="group.slot" class="slot-group">
      <div class="slot-group-head">
        <SettingsSlotChip :slot="group.slot" :label="slotLabel(group.slot)"/>
        <span class="pill-count">{{ group.items.length }}</span>
      </div>
      <div class="slot-cards compact">
        <article
            v-for="item in group.items"
            :key="item.id"
            class="slot-card snippet-card"
            :class="{
            expanded: expandedId === item.id,
            off: !item.enabled,
            customized: hasSnippetOverride(item.id),
          }"
        >
          <header class="slot-card-head clickable" @click="emit('toggleSnippet', item)">
            <label class="mini-switch" @click.stop>
              <input
                  type="checkbox"
                  :checked="item.enabled"
                  @change="emit('toggleEnabled', item.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="mini-switch-track" aria-hidden="true"/>
            </label>
            <div class="snippet-head-copy">
              <span class="snippet-tab mono">{{ item.label }}</span>
              <span v-if="item.detail" class="snippet-desc">{{ item.detail }}</span>
            </div>
            <span v-if="hasSnippetOverride(item.id)" class="pill-custom">
              {{ isCustomSnippetId(item.id) ? t('settings.keywords_custom_badge') : t('settings.snippets_override') }}
            </span>
            <span class="chevron" :class="{ open: expandedId === item.id }">›</span>
          </header>

          <div v-if="expandedId === item.id" class="slot-card-edit">
            <SettingsSnippetForm
                :label="draft.label"
                :insert-text="draft.insertText"
                :detail="draft.detail"
                @update:label="emit('update:draft-label', $event)"
                @update:insert-text="emit('update:draft-insertText', $event)"
                @update:detail="emit('update:draft-detail', $event)"
            />
            <div class="edit-toolbar">
              <button
                  v-if="hasSnippetOverride(item.id)"
                  type="button"
                  class="btn-mini danger"
                  @click="emit('remove')"
              >
                {{ isCustomSnippetId(item.id) ? t('settings.snippets_delete') : t('settings.keywords_restore') }}
              </button>
              <button
                  type="button"
                  class="btn-mini primary"
                  :class="{saved: saveFlash}"
                  :disabled="saveFlash"
                  @click="onSaveClick"
              >
                {{ saveFlash ? t('settings.snippets_saved') : t('settings.snippets_save') }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>

    <article class="slot-card add-card" :class="{ expanded: showAddForm }">
      <header class="slot-card-head clickable" @click="emit('toggleAddForm')">
        <span class="add-icon">+</span>
        <span class="add-title">{{ t('settings.snippets_add') }}</span>
        <span class="chevron" :class="{ open: showAddForm }">›</span>
      </header>
      <div v-if="showAddForm" class="slot-card-edit">
        <SettingsSnippetForm
            :label="newDraft.label"
            :insert-text="newDraft.insertText"
            :detail="newDraft.detail"
            :insert-rows="3"
            :insert-placeholder="t('settings.snippets_insert_placeholder')"
            @update:label="emit('update:new-label', $event)"
            @update:insert-text="emit('update:new-insertText', $event)"
            @update:detail="emit('update:new-detail', $event)"
        />
        <label class="dw-field add-context-field">
          <span class="dw-field__label">{{ t('settings.snippets_context') }}</span>
          <select
              class="dw-input"
              :value="newDraft.slot"
              @change="emit('update:new-slot', ($event.target as HTMLSelectElement).value as SqlCompletionSlot)"
          >
            <option v-for="slot in SQL_COMPLETION_SLOT_ORDER" :key="slot" :value="slot">
              {{ slotLabel(slot) }}
            </option>
          </select>
        </label>
        <div class="edit-toolbar">
          <button type="button" class="btn-mini" @click="emit('cancelAdd')">
            {{ t('settings.reset_cancel') }}
          </button>
          <button type="button" class="btn-mini primary" @click="emit('submitNew')">
            {{ t('settings.snippets_add') }}
          </button>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped>
.section-hint {
  margin: 0 0 8px;
  font-size: 10px;
  line-height: 1.45;
  color: var(--se-text-muted, #9ca3af);
}

.section-hint--usage {
  margin-top: -4px;
}

.add-context-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.add-context-field .dw-field__label {
  font-size: 9px;
  font-weight: 600;
  color: var(--se-text-muted, #9ca3af);
}

.add-context-field .dw-input {
  padding: 4px 6px;
  border: 1px solid var(--se-border, rgba(0, 0, 0, 0.08));
  border-radius: 5px;
  background: var(--se-bg, #fff);
  font-size: 10px;
  color: var(--se-text, #111827);
}

.slot-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.slot-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 2px 4px;
}

.pill-count {
  min-width: 16px;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  text-align: center;
  color: var(--se-text-muted, #9ca3af);
  background: var(--se-bg-muted, #f8f9fb);
  border: 1px solid var(--se-border, rgba(0, 0, 0, 0.08));
}

.slot-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slot-cards.compact {
  gap: 4px;
}

.slot-card {
  border: 1px solid var(--se-border, rgba(0, 0, 0, 0.08));
  border-radius: 7px;
  background: color-mix(in srgb, var(--se-bg-muted, #f8f9fb) 24%, var(--se-bg, #fff));
  overflow: hidden;
  transition: border-color 0.12s, box-shadow 0.12s;
}

.slot-card.customized {
  border-color: color-mix(in srgb, var(--se-accent, #0969da) 22%, var(--se-border, rgba(0, 0, 0, 0.08)));
}

.slot-card.expanded {
  border-color: color-mix(in srgb, var(--se-accent, #0969da) 32%, var(--se-border, rgba(0, 0, 0, 0.08)));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--se-accent, #0969da) 10%, transparent);
}

.slot-card.off {
  opacity: 0.62;
}

.slot-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 5px 7px;
}

.slot-card-head.clickable {
  cursor: pointer;
  user-select: none;
}

.slot-card-head.clickable:hover {
  background: color-mix(in srgb, var(--se-accent, #0969da) 4%, transparent);
}

.pill-custom {
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--se-accent, #0969da);
  background: color-mix(in srgb, var(--se-accent, #0969da) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--se-accent, #0969da) 22%, transparent);
}

.mini-switch {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
}

.mini-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.mini-switch-track {
  position: relative;
  display: block;
  width: 26px;
  height: 14px;
  border-radius: 999px;
  background: var(--se-bg-muted, #f8f9fb);
  border: 1px solid var(--se-border, rgba(0, 0, 0, 0.08));
  transition: background 0.12s, border-color 0.12s;
}

.mini-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: transform 0.12s;
}

.mini-switch input:checked + .mini-switch-track {
  background: color-mix(in srgb, var(--se-accent, #0969da) 78%, #000);
  border-color: color-mix(in srgb, var(--se-accent, #0969da) 45%, transparent);
}

.mini-switch input:checked + .mini-switch-track::after {
  transform: translateX(12px);
}

.snippet-head-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.snippet-tab {
  font-size: 10px;
  font-weight: 700;
  color: var(--se-text, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snippet-desc {
  font-size: 9px;
  color: var(--se-text-muted, #9ca3af);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
  color: var(--se-text-muted, #9ca3af);
  transform: rotate(0deg);
  transition: transform 0.12s, color 0.12s;
}

.chevron.open {
  transform: rotate(90deg);
  color: var(--se-accent, #0969da);
}

.slot-card-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 7px 7px;
  border-top: 1px solid color-mix(in srgb, var(--se-border, rgba(0, 0, 0, 0.08)) 70%, transparent);
}

.edit-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
}

.btn-mini {
  padding: 3px 8px;
  border: 1px solid var(--se-border, rgba(0, 0, 0, 0.08));
  border-radius: 5px;
  background: var(--se-bg-muted, #f8f9fb);
  font-size: 10px;
  font-weight: 600;
  color: var(--se-text-secondary, #6b7280);
  cursor: pointer;
}

.btn-mini.primary {
  color: #fff;
  background: color-mix(in srgb, var(--se-accent, #0969da) 88%, #000);
  border-color: color-mix(in srgb, var(--se-accent, #0969da) 50%, transparent);
}

.btn-mini.primary.saved {
  color: #fff;
  background: color-mix(in srgb, #16a34a 88%, #000);
  border-color: color-mix(in srgb, #16a34a 50%, transparent);
  cursor: default;
}

.btn-mini.danger {
  color: color-mix(in srgb, var(--se-danger, #dc2626) 82%, var(--se-text, #111827));
  border-color: color-mix(in srgb, var(--se-danger, #dc2626) 30%, transparent);
  background: color-mix(in srgb, var(--se-danger, #dc2626) 8%, var(--se-bg, #fff));
}

.btn-mini:hover {
  filter: brightness(1.05);
}

.add-card {
  border-style: dashed;
  background: transparent;
}

.add-card.expanded {
  border-style: solid;
}

.add-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 700;
  color: var(--se-accent, #0969da);
  background: color-mix(in srgb, var(--se-accent, #0969da) 10%, transparent);
}

.add-title {
  flex: 1;
  font-size: 10px;
  font-weight: 700;
  color: var(--se-text-secondary, #6b7280);
}
</style>
