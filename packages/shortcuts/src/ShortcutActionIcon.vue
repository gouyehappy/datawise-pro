<script setup lang="ts">
import {computed} from 'vue'
import {DwIcon} from '@datawise/icons'
import {getShortcutDefinition} from './definitions-registry'

const props = defineProps<{
  actionId: string
  size?: number
}>()

const iconName = computed(() => getShortcutDefinition(props.actionId)?.icon ?? '')
const size = computed(() => props.size ?? 16)
</script>

<template>
  <span class="shortcut-action-icon">
    <DwIcon v-if="iconName" :name="iconName" :size="size" :stroke-width="1.6"/>
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
