<script setup lang="ts">
import {computed} from 'vue'
import {DwIcon, shortcutActionDwIcon} from '@/core/icons'
import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import type {ShortcutActionId} from '@/core/shortcuts/types'

const props = defineProps<{
  actionId: ShortcutActionId
  size?: number
}>()

const iconName = computed(
    () => SHORTCUT_DEFINITIONS.find((item) => item.id === props.actionId)?.icon ?? '',
)
const dwIconName = computed(() => shortcutActionDwIcon(iconName.value))
const size = computed(() => props.size ?? 16)
</script>

<template>
  <span class="shortcut-action-icon">
    <DwIcon v-if="dwIconName" :name="dwIconName" :size="size" :stroke-width="1.6"/>
  </span>
</template>

<style scoped>
.shortcut-action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-icon-size-md);
  height: var(--dw-icon-size-md);
}
</style>
