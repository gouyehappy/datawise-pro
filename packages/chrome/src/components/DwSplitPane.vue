<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import ResizeHandle from './ResizeHandle.vue'
import {usePersistedSplitWidth} from '../composables/usePersistedSplitWidth'
import {
  resolveDwSplitRatio,
  widthFromRatio,
  type DwSplitRatio,
} from '../composables/dwSplitRatio'

const props = withDefaults(
  defineProps<{
    storageKey?: string
    defaultWidth?: number
    defaultRatio?: DwSplitRatio
    minWidth?: number
    maxWidth?: number
    maxRatio?: number
    endMinWidth?: number
    stackBelow?: number | false
    startClass?: string | string[] | Record<string, boolean>
    endClass?: string | string[] | Record<string, boolean>
    handleVariant?: 'ghost' | 'line'
    handleClass?: string
    disabled?: boolean
  }>(),
  {
    defaultWidth: 280,
    defaultRatio: 'third',
    minWidth: 180,
    maxWidth: 960,
    maxRatio: 0.7,
    endMinWidth: 280,
    stackBelow: 900,
    handleVariant: 'ghost',
    disabled: false,
  },
)

const rootRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)

const stacked = computed(() => {
  if (props.stackBelow === false) return false
  if (containerWidth.value <= 0) return false
  return containerWidth.value < props.stackBelow
})

const resolvedRatio = computed(() => resolveDwSplitRatio(props.defaultRatio))

const effectiveMax = computed(() => {
  const cw = containerWidth.value
  const fromRatio = cw > 0 ? Math.round(cw * props.maxRatio) : props.maxWidth
  const fromEnd = cw > 0 ? Math.max(props.minWidth, cw - props.endMinWidth) : props.maxWidth
  return Math.max(props.minWidth, Math.min(props.maxWidth, fromRatio, fromEnd))
})

const resolvedDefaultWidth = computed(() => {
  if (containerWidth.value <= 0) return props.defaultWidth
  return widthFromRatio(
    containerWidth.value,
    resolvedRatio.value,
    props.minWidth,
    effectiveMax.value,
  )
})

const {width} = usePersistedSplitWidth({
  key: () => props.storageKey,
  defaultWidth: () => resolvedDefaultWidth.value,
  min: () => props.minWidth,
  max: () => effectiveMax.value,
})

watch(effectiveMax, (max) => {
  if (width.value > max) width.value = max
})

let observer: ResizeObserver | null = null

onMounted(() => {
  const el = rootRef.value
  if (!el) return
  const measure = () => {
    containerWidth.value = Math.round(el.getBoundingClientRect().width)
  }
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(el)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

const showHandle = computed(() => !props.disabled && !stacked.value)

const startStyle = computed(() => {
  if (stacked.value || props.disabled) return undefined
  return {width: `${width.value}px`, flex: '0 0 auto'}
})
</script>

<template>
  <div
    ref="rootRef"
    class="dw-split-pane"
    :class="{
      'dw-split-pane--stacked': stacked,
      'dw-split-pane--disabled': disabled,
      [`dw-split-pane--ratio-${typeof defaultRatio === 'string' ? defaultRatio : 'custom'}`]: true,
    }"
  >
    <div class="dw-split-pane__start" :class="startClass" :style="startStyle">
      <slot name="start"/>
    </div>
    <ResizeHandle
      v-if="showHandle"
      v-model="width"
      :min="minWidth"
      :max="effectiveMax"
      :variant="handleVariant"
      class="dw-split-pane__handle"
      :class="handleClass"
    />
    <div class="dw-split-pane__end" :class="endClass">
      <slot name="end"/>
    </div>
  </div>
</template>

<style scoped>
.dw-split-pane {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  gap: 0;
}
.dw-split-pane__start,
.dw-split-pane__end {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.dw-split-pane__start { position: relative; }
.dw-split-pane__end { flex: 1 1 auto; }
.dw-split-pane__handle {
  position: relative;
  z-index: var(--dw-z-raised, 2);
  flex: 0 0 var(--dw-splitter-size, 4px);
  width: var(--dw-splitter-size, 4px);
  align-self: stretch;
  height: auto;
  touch-action: none;
}
.dw-split-pane__handle::before {
  content: '';
  position: absolute;
  inset: 0 -4px;
}
.dw-split-pane--stacked { flex-direction: column; }
.dw-split-pane--stacked .dw-split-pane__start {
  width: auto !important;
  flex: 0 1 38%;
  min-height: 160px;
  max-height: 42%;
}
.dw-split-pane--stacked .dw-split-pane__end { flex: 1 1 auto; }
.dw-split-pane--disabled .dw-split-pane__start {
  flex: 0 1 auto;
  width: auto;
  max-width: min(34%, 360px);
}
</style>
