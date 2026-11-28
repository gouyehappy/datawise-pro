<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import type {EChartsOption, EChartsType} from 'echarts'

const props = defineProps<{
  option: EChartsOption | null
}>()

const chartRef = ref<HTMLElement>()
let chart: EChartsType | null = null
let echartsApi: typeof import('echarts') | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let lastOptionJson = ''
let renderGeneration = 0

async function ensureEcharts() {
  echartsApi ??= await import('echarts')
  return echartsApi
}

function disposeChart() {
  chart?.dispose()
  chart = null
}

function dispose() {
  renderGeneration += 1
  disposeChart()
  lastOptionJson = ''
}

async function render() {
  if (!props.option) {
    dispose()
    return
  }
  if (!chartRef.value) return
  const generation = ++renderGeneration
  const echarts = await ensureEcharts()
  if (generation !== renderGeneration) return
  // v-if may have torn down the old DOM while chart still pointed at it.
  if (!chartRef.value) return
  if (chart) {
    const dom = chart.getDom?.()
    if (!dom || dom !== chartRef.value || !dom.isConnected) {
      disposeChart()
    }
  }
  if (!chart) {
    chart = echarts.init(chartRef.value)
  }
  if (generation !== renderGeneration) return
  chart.setOption(props.option, true)
  chart.resize()
}

function scheduleRender() {
  if (!props.option) {
    dispose()
    return
  }
  const nextJson = JSON.stringify(props.option)
  if (nextJson === lastOptionJson && chart) return
  lastOptionJson = nextJson
  void nextTick(() => {
    void render()
  })
}

function onWindowResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    resizeTimer = null
    chart?.resize()
  }, 120)
}

onMounted(() => {
  scheduleRender()
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  if (resizeTimer) clearTimeout(resizeTimer)
  window.removeEventListener('resize', onWindowResize)
  dispose()
})

watch(() => props.option, () => scheduleRender())
</script>

<template>
  <div v-if="option" ref="chartRef" class="echarts-panel"/>
</template>

<style scoped>
.echarts-panel {
  width: 100%;
  height: 360px;
  padding: var(--dw-space-5) var(--dw-space-5) var(--dw-space-3);
  box-sizing: border-box;
  background: radial-gradient(ellipse 70% 60% at 50% 100%, color-mix(in srgb, var(--dw-primary) 5%, transparent), transparent 70%),
  linear-gradient(180deg, color-mix(in srgb, var(--dw-bg-panel) 40%, var(--dw-bg)), var(--dw-bg));
}
</style>
