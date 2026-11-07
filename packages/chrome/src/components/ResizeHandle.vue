<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useDwI18n} from '@datawise/ui'

const t = useDwI18n()

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    axis?: 'horizontal' | 'vertical'
    direction?: 'horizontal' | 'vertical'
    invert?: boolean
    variant?: 'ghost' | 'line'
  }>(),
  {axis: 'horizontal', invert: false, variant: 'ghost', min: 200, max: 480},
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const dragging = ref(false)
const startPos = ref(0)
const startSize = ref(0)

const resolvedAxis = computed<'horizontal' | 'vertical'>(() => {
  if (props.direction === 'horizontal') return 'vertical'
  if (props.direction === 'vertical') return 'horizontal'
  return props.axis
})

const resolvedInvert = computed(() => {
  if (props.direction != null) {
    return props.direction === 'horizontal' ? !props.invert : props.invert
  }
  return props.invert
})

function onPointerDown(e: PointerEvent) {
  dragging.value = true
  startPos.value = resolvedAxis.value === 'vertical' ? e.clientY : e.clientX
  startSize.value = props.modelValue
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const rawDelta = resolvedAxis.value === 'vertical'
    ? startPos.value - e.clientY
    : e.clientX - startPos.value
  const delta = resolvedInvert.value ? -rawDelta : rawDelta
  const next = startSize.value + delta
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, next)))
}

function onPointerUp() {
  dragging.value = false
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

const resizeTitle = computed(() =>
  resolvedAxis.value === 'vertical' ? t('common.resizeHeight') : t('common.resizeWidth'),
)
</script>

<template>
  <div
    class="resize-handle"
    :class="[resolvedAxis, `resize-handle--${variant}`, { dragging }]"
    :title="resizeTitle"
    @pointerdown="onPointerDown"
  />
</template>

<style scoped>
.resize-handle {
  flex-shrink: 0;
  background: transparent;
  transition: background var(--dw-duration) var(--dw-ease);
}
.resize-handle--line { background: var(--dw-border-light); }
.resize-handle.horizontal { width: 4px; cursor: col-resize; }
.resize-handle.vertical { height: 4px; cursor: row-resize; }
.resize-handle:hover,
.resize-handle.dragging { background: var(--dw-primary-soft); }
</style>
