<script setup lang="ts">
import {useCompletionSlotLabel} from '@sql-editor/composables/useCompletionSlotLabel'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import SettingsSlotChip from '@sql-editor/components/settings/SettingsSlotChip.vue'
import type {SlotGroupedItems} from '@sql-editor/constants/completion-slots'
import type {SqlCompletionSlot, SqlQuickChipConfig} from '@sql-editor/types'

defineProps<{
  groups: SlotGroupedItems<SqlQuickChipConfig>[]
  isQuickChipEnabled: (chipId: string) => boolean
}>()

const emit = defineEmits<{
  toggleChip: [chipId: string, enabled: boolean]
}>()

const {t} = useSqlEditorI18n()
const {slotLabel} = useCompletionSlotLabel()

function chipLabel(chip: SqlQuickChipConfig): string {
  if (chip.titleKey) {
    const key = chip.titleKey as Parameters<typeof t>[0]
    const translated = t(key)
    if (translated !== key) return translated
  }
  return chip.label
}
</script>

<template>
  <section class="panel-section">
    <div v-for="group in groups" :key="group.slot" class="group-block">
      <div class="group-head">
        <SettingsSlotChip :slot="group.slot" :label="slotLabel(group.slot)"/>
      </div>
      <div class="chip-grid">
        <button
            v-for="chip in group.items"
            :key="chip.id"
            type="button"
            class="chip-pill"
            :class="{ on: isQuickChipEnabled(chip.id) }"
            :title="chipLabel(chip)"
            @click="emit('toggleChip', chip.id, !isQuickChipEnabled(chip.id))"
        >{{ chip.label }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-block + .group-block {
  margin-top: 6px;
}

.group-head {
  margin-bottom: 4px;
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip-pill {
  min-width: 28px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--se-border);
  background: var(--se-bg-muted);
  font-size: 10px;
  font-weight: 700;
  color: var(--se-text-muted);
  cursor: pointer;
  font-family: var(--dw-mono, ui-monospace, monospace);
}

.chip-pill.on {
  color: var(--se-chip);
  background: color-mix(in srgb, var(--se-chip) 12%, var(--se-bg));
  border-color: color-mix(in srgb, var(--se-chip) 28%, transparent);
}

.chip-pill:hover {
  border-color: color-mix(in srgb, var(--se-text-muted) 35%, transparent);
}
</style>
