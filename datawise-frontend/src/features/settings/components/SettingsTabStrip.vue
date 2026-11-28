<script setup lang="ts">
/**
 * 设置页内的顶部选项卡条 —— 统一 SettingsSegmentTabs 的包裹与 stretch 行为。
 * 用于基础设置 / 编辑器 / SQL 编辑器行为 / DataAgent Hub 等同构场景。
 */
import SettingsSegmentTabs, {type SettingsSegmentTab} from './SettingsSegmentTabs.vue'

export type {SettingsSegmentTab}

withDefaults(
    defineProps<{
      tabs: SettingsSegmentTab[]
      modelValue: string
      ariaLabel?: string
    }>(),
    {},
)

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()
</script>

<template>
  <div class="settings-tab-strip">
    <SettingsSegmentTabs
        stretch
        :model-value="modelValue"
        :tabs="tabs"
        :aria-label="ariaLabel"
        @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.settings-tab-strip {
  min-width: 0;
}
</style>
