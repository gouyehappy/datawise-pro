<script setup lang="ts">
/**
 * Painted overlay scrollbar (preferred).
 * Pass class onto the scroll viewport (e.g. `.explorer-body` for closest()).
 * For roots you cannot wrap: `data-overlay-scroll` + installOverlayScrollbarHosts.
 *
 * @example
 * <DwOverlayScroll class="panel-body">
 *   <Tree />
 * </DwOverlayScroll>
 */
import {ref, useAttrs} from 'vue'
import {useOverlayScrollbar} from '../composables/useOverlayScrollbar'
import '../styles/overlay-scrollbar.css'

defineOptions({inheritAttrs: false})

const props = withDefaults(
  defineProps<{
    /** ms before thumb fades after scroll stops */
    hideAfterMs?: number
  }>(),
  {
    hideAfterMs: 900,
  },
)

const emit = defineEmits<{
  scroll: [event: Event]
}>()

const attrs = useAttrs()
const viewportRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

const {
  needV,
  needH,
  revealed,
  dragging,
  vSliderStyle,
  hSliderStyle,
  onScroll,
  reveal,
  scheduleHide,
  keepRevealed,
  onRailPointerDown,
  startDrag,
  syncMetrics,
} = useOverlayScrollbar(viewportRef, {
  hideAfterMs: props.hideAfterMs,
  contentRef,
})

function handleScroll(event: Event) {
  onScroll()
  emit('scroll', event)
}

defineExpose({
  /** Actual scroll viewport DOM (scrollTo / scrollTop) */
  el: viewportRef,
  syncMetrics,
})
</script>

<template>
  <div
    class="dw-overlay-scroll"
    @mouseenter="reveal"
    @mouseleave="scheduleHide"
  >
    <div
      ref="viewportRef"
      class="dw-overlay-scroll__viewport"
      v-bind="attrs"
      @scroll.passive="handleScroll"
    >
      <div ref="contentRef" class="dw-overlay-scroll__content">
        <slot/>
      </div>
    </div>

    <div
      v-if="needV"
      class="dw-overlay-scroll__rail dw-overlay-scroll__rail--v"
      :class="{
        'is-needed': needV,
        'is-visible': revealed || dragging === 'v',
        'is-active': dragging === 'v',
      }"
      @pointerdown="onRailPointerDown('v', $event)"
      @mouseenter="keepRevealed"
    >
      <div
        class="dw-overlay-scroll__slider"
        :style="vSliderStyle"
        @pointerdown.stop="startDrag('v', $event)"
      />
    </div>

    <div
      v-if="needH"
      class="dw-overlay-scroll__rail dw-overlay-scroll__rail--h"
      :class="{
        'is-needed': needH,
        'is-visible': revealed || dragging === 'h',
        'is-active': dragging === 'h',
        'is-corner': needV,
      }"
      @pointerdown="onRailPointerDown('h', $event)"
      @mouseenter="keepRevealed"
    >
      <div
        class="dw-overlay-scroll__slider"
        :style="hSliderStyle"
        @pointerdown.stop="startDrag('h', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
/*
 * Keep content within the viewport width so flex children can ellipsize.
 * Wide children with an explicit min-width can still force horizontal scroll;
 * min-content here would expand the host and clip trailing badges instead of
 * truncating labels.
 */
.dw-overlay-scroll__content {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}
</style>
