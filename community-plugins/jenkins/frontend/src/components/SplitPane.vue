<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storageGet, storageSet } from '../lib/bridge'

const props = withDefaults(
  defineProps<{
    storageKey?: string
    /** Initial width of the start pane in px */
    defaultWidth?: number
    minWidth?: number
    maxWidth?: number
    /** When true, start pane is on the left (default). */
    vertical?: boolean
  }>(),
  {
    defaultWidth: 280,
    minWidth: 180,
    maxWidth: 560,
    vertical: true,
  },
)

const width = ref(props.defaultWidth)
const dragging = ref(false)
const root = ref<HTMLElement | null>(null)

async function restore() {
  if (!props.storageKey) return
  const raw = await storageGet(props.storageKey)
  const n = Number(raw)
  if (Number.isFinite(n) && n >= props.minWidth && n <= props.maxWidth) {
    width.value = Math.round(n)
  }
}

async function persist() {
  if (!props.storageKey) return
  await storageSet(props.storageKey, String(Math.round(width.value)))
}

function onPointerDown(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  dragging.value = true
  document.body.classList.add('jk-split-dragging')
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || !root.value) return
  const rect = root.value.getBoundingClientRect()
  let next = props.vertical ? e.clientX - rect.left : e.clientY - rect.top
  const max = Math.min(props.maxWidth, (props.vertical ? rect.width : rect.height) - 160)
  next = Math.max(props.minWidth, Math.min(max, next))
  width.value = Math.round(next)
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  document.body.classList.remove('jk-split-dragging')
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  void persist()
}

onMounted(() => { void restore() })
onBeforeUnmount(() => document.body.classList.remove('jk-split-dragging'))
watch(
  () => props.defaultWidth,
  (v) => {
    if (!props.storageKey) width.value = v
  },
)
</script>

<template>
  <div
    ref="root"
    class="jk-split"
    :class="{ 'jk-split--row': vertical, 'jk-split--col': !vertical, 'is-dragging': dragging }"
  >
    <div class="jk-split__start" :style="vertical ? { width: width + 'px' } : { height: width + 'px' }">
      <slot name="start" />
    </div>
    <div
      class="jk-split__handle"
      role="separator"
      :aria-orientation="vertical ? 'vertical' : 'horizontal'"
      :aria-valuenow="width"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <div class="jk-split__end">
      <slot name="end" />
    </div>
  </div>
</template>
