<script setup lang="ts">
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'

defineProps<{
  aliases: Array<{ alias: string; table: string }>
}>()

const emit = defineEmits<{
  aliasClick: [alias: string]
}>()

const {t} = useSqlEditorI18n()
</script>

<template>
  <div class="hint-aliases">
    <button
        v-for="item in aliases"
        :key="`${item.alias}:${item.table}`"
        type="button"
        class="hint-alias"
        :title="t('hintbar.insert_alias', { alias: item.alias, table: item.table })"
        @click="emit('aliasClick', item.alias)"
    >{{ item.alias }}
    </button>
  </div>
</template>

<style scoped>
.hint-aliases {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 96px;
  overflow: hidden;
}

.hint-alias {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 28px;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--dw-border-light, rgba(0, 0, 0, 0.08));
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  color: #0f766e;
  background: color-mix(in srgb, #14b8a6 8%, transparent);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.hint-alias:hover {
  background: color-mix(in srgb, #14b8a6 16%, transparent);
}
</style>
