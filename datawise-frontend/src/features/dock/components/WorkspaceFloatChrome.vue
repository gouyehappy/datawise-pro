<script setup lang="ts">
/** Dedicated title bar when the workspace panel is floated — keeps pin/drag off tab chrome. */
import {useI18n} from 'vue-i18n'
import DockDragGrip from '@/features/dock/components/DockDragGrip.vue'
import DockFloatActions from '@/features/dock/components/DockFloatActions.vue'
import {usePanelHeaderDrag} from '@/features/dock/composables/usePanelHeaderDrag'

const {t} = useI18n()
const {onPointerDown} = usePanelHeaderDrag('workspace')
</script>

<template>
  <header
      class="workspace-float-chrome dock-drag-zone"
      data-dock-grip
      :title="t('dock.minimap.dragHint')"
      @pointerdown="onPointerDown"
  >
    <div class="workspace-float-chrome__lead">
      <DockDragGrip variant="edge" :interactive="false"/>
      <span class="workspace-float-chrome__title">{{ t('dock.minimap.workspace') }}</span>
    </div>
    <DockFloatActions panel="workspace"/>
  </header>
</template>

<style scoped>
.workspace-float-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: var(--dw-gap-xs);
  height: var(--dw-toolbar-height);
  padding: 0 var(--dw-space-3) 0 var(--dw-space-2);
  border-bottom: 1px solid var(--dw-border-light);
  background: linear-gradient(180deg, var(--dw-bg) 0%, var(--dw-bg-panel) 100%);
  cursor: grab;
  user-select: none;
}

.workspace-float-chrome:active {
  cursor: grabbing;
}

.workspace-float-chrome:hover {
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--dw-bg) 70%, var(--dw-primary) 8%) 0%,
      var(--dw-bg-panel) 100%
  );
}

.workspace-float-chrome__lead {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  min-width: 0;
}

.workspace-float-chrome__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text-secondary);
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
