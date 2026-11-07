<script setup lang="ts">
import {computed} from 'vue'
import {completionSlotToneClass} from '@sql-editor/constants/completion-slots'
import type {SqlCompletionSlot} from '@sql-editor/types'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'

const props = defineProps<{
  statementLabel: string
  completionSlot: SqlCompletionSlot
  slotLabel: string
  dialectLabel?: string
}>()

const {t} = useSqlEditorI18n()
const slotTone = computed(() => completionSlotToneClass(props.completionSlot))
</script>

<template>
  <div class="hint-leading">
    <span class="hint-badge hint-statement">{{ statementLabel }}</span>
    <span class="hint-badge hint-slot" :class="slotTone">{{ slotLabel }}</span>
    <span class="hint-dialect-slot">
      <span
          v-if="dialectLabel"
          class="hint-dialect"
          :title="t('hintbar.dialect', { dialect: dialectLabel })"
      >{{ dialectLabel }}</span>
    </span>
  </div>
</template>

<style scoped>
.hint-leading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  width: 192px;
  min-width: 192px;
}

.hint-dialect-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  min-width: 52px;
  flex-shrink: 0;
}

.hint-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.04em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint-statement {
  width: 56px;
  min-width: 56px;
  color: var(--dw-accent, #0969da);
  background: color-mix(in srgb, var(--dw-accent, #0969da) 14%, transparent);
}

.hint-slot {
  width: 72px;
  min-width: 72px;
  color: #fff;
}

.hint-dialect {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 52px;
  min-width: 52px;
  height: 18px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  color: var(--dw-text-secondary, #555);
  background: var(--dw-bg-muted, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--dw-border-light, rgba(0, 0, 0, 0.06));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<style src="@sql-editor/styles/completion-slot-ui.css"></style>
