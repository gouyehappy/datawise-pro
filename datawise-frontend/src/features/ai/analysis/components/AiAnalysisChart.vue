<script setup lang="ts">
import type {EChartsOption} from 'echarts'
import EchartsPanel from '@/shared/charts/EchartsPanel.vue'

withDefaults(
    defineProps<{
      option: EChartsOption | null
      /** Narrow assistant drawer — shorter chart. */
      compact?: boolean
    }>(),
    {compact: false},
)
</script>

<template>
  <EchartsPanel
      class="ai-analysis-chart"
      :class="{ 'ai-analysis-chart--compact': compact }"
      :option="option"
  />
</template>

<style scoped>
.ai-analysis-chart :deep(.echarts-panel) {
  height: 380px;
  border-radius: 0 0 var(--dw-panel-radius) var(--dw-panel-radius);
}

.ai-analysis-chart--compact :deep(.echarts-panel) {
  height: 180px;
}
</style>
