<script setup lang="ts">
import {DwCard} from '@/core/components'

defineProps<{
    editMode: boolean
    isDragging: boolean
    isDropTarget: boolean
    cardClass?: string | Record<string, boolean> | Array<string | Record<string, boolean>>
}>()

const emit = defineEmits<{
    'drag-start': [event: DragEvent]
    'drag-over': []
    drop: []
    'drag-end': []
}>()
</script>

<template>
  <!-- AURA-X: [Modify] - 仪表盘卡片表面统一 DwCard(widget)，拖拽与编辑行为不变 -->
  <!-- Protection: 功能完整性已验证，无简化行为 -->
  <DwCard
      variant="widget"
      :class="[
        cardClass,
        {
          'dash-card--edit': editMode,
          'is-dragging': isDragging,
          'is-drop-target': isDropTarget,
        },
      ]"
      @dragover.prevent="editMode && emit('drag-over')"
      @drop.prevent="editMode && emit('drop')"
  >
    <button
        v-if="editMode"
        type="button"
        class="dash-card__drag"
        draggable="true"
        aria-label="Drag to reorder"
        @dragstart.stop="emit('drag-start', $event)"
        @dragend="emit('drag-end')"
    >
      ⋮⋮
    </button>
    <slot/>
  </DwCard>
</template>

<style scoped>
:deep(.dash-card--edit) {
  position: relative;
  outline: 1px dashed color-mix(in srgb, var(--dw-primary) 35%, var(--dw-panel-border));
  outline-offset: 2px;
}

:deep(.dash-card.is-dragging) {
  opacity: 0.55;
}

:deep(.dash-card.is-drop-target) {
  outline: 2px solid var(--dw-primary);
  outline-offset: 2px;
}

.dash-card__drag {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: var(--dw-z-raised);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--dw-btn-height);
  padding: 0;
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-editor);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: 1;
  cursor: grab;
}

.dash-card__drag:active {
  cursor: grabbing;
}
</style>
