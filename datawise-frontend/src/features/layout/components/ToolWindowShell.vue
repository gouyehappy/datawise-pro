<script setup lang="ts">
import {computed} from 'vue'
import {CollapseButton, DwOverlayScroll} from '@/core/components'
import DockDragGrip from '@/features/dock/components/DockDragGrip.vue'
import DockFloatActions from '@/features/dock/components/DockFloatActions.vue'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import type {DockDragPanel} from '@/features/dock/types/dock.types'

const props = withDefaults(
    defineProps<{
      title: string
      subtitle?: string
      /** 收起按钮文案，默认 common.collapse */
      collapseLabel?: string
      /** When true, title bar is a dock-move zone (grip is the cue). */
      headerDraggable?: boolean
      /** Explorer-style pin-back / close when this shell is a floated dock panel. */
      dockPanel?: Extract<DockDragPanel, 'terminal' | 'shortcut'>
      /**
       * Wrap body in DwOverlayScroll (default). Set false when the slot owns
       * its own scroll pane (e.g. AI assistant: messages scroll, composer pinned).
       */
      bodyScroll?: boolean
    }>(),
    {
      headerDraggable: false,
      bodyScroll: true,
    },
)

const dock = useDockPlacementStore()
const isDockFloating = computed(() =>
    props.dockPanel ? dock.isPanelFloating(props.dockPanel) : false,
)

const emit = defineEmits<{
  collapse: []
  headerPointerdown: [event: PointerEvent]
}>()
</script>

<template>
  <section class="tool-window dw-panel-hover-chrome">
    <header
        class="tool-window__head"
        :class="{ 'dock-drag-zone': headerDraggable }"
        :data-dock-grip="headerDraggable ? '' : undefined"
        @pointerdown="headerDraggable && emit('headerPointerdown', $event)"
    >
      <DockDragGrip v-if="headerDraggable" :interactive="false"/>
      <div class="tool-window__head-text">
        <slot name="head-text">
          <h3 class="tool-window__title">{{ title }}</h3>
          <p v-if="subtitle" class="tool-window__subtitle">{{ subtitle }}</p>
        </slot>
      </div>
      <div class="tool-window__head-actions" @pointerdown.stop>
        <slot name="head-actions"/>
        <DockFloatActions v-if="dockPanel" :panel="dockPanel"/>
        <span v-if="!isDockFloating" class="dw-panel-hover-actions">
          <CollapseButton :label="collapseLabel" @click="emit('collapse')"/>
        </span>
      </div>
    </header>
    <DwOverlayScroll v-if="bodyScroll" class="tool-window__body">
      <slot/>
    </DwOverlayScroll>
    <div v-else class="tool-window__body tool-window__body--plain">
      <slot/>
    </div>
  </section>
</template>

<style scoped>
:deep(.dw-overlay-scroll) {
  flex: 1;
  min-height: 0;
}

.tool-window__body--plain {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tool-window__head-text {
  flex: 1;
  min-width: 0;
}

.dock-drag-zone {
  cursor: grab;
}

.dock-drag-zone:active {
  cursor: grabbing;
}

.dock-drag-zone:hover {
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
}
</style>
