<script setup lang="ts">
import {Handle, Position} from '@vue-flow/core'
import {DwIcon} from '@/core/icons'
import {DwGraphNodeShell} from '@/core/graph-canvas'
import {
  MIGRATION_CANVAS_NODE_H,
  MIGRATION_CANVAS_NODE_W,
  type MigrationCanvasNodeKind,
  type MigrationCanvasNodeStatus,
} from '@/features/workspace/services/migration-canvas.service'

defineProps<{
  data: {
    kind: MigrationCanvasNodeKind
    title: string
    subtitle: string
    badge: string
    status: MigrationCanvasNodeStatus
    statusLabel: string
    selected?: boolean
  }
  selected?: boolean
}>()

const nodeWidth = MIGRATION_CANVAS_NODE_W
const nodeHeightCss = `${MIGRATION_CANVAS_NODE_H}px`

const iconByKind: Record<MigrationCanvasNodeKind, 'connection' | 'table' | 'settings' | 'database'> = {
  source: 'connection',
  tables: 'table',
  mode: 'settings',
  target: 'database',
}
</script>

<template>
  <DwGraphNodeShell
      class="migration-flow-node"
      :class="{
        'migration-flow-node--ready': data.status === 'ready',
        'migration-flow-node--incomplete': data.status === 'incomplete',
      }"
      :title="data.title"
      :subtitle="data.subtitle || '\u00a0'"
      :badge="data.badge"
      :accent="data.kind === 'source' || Boolean(selected || data.selected)"
      :selected="Boolean(selected || data.selected)"
      :width="nodeWidth"
  >
    <div class="migration-flow-node__meta">
      <span class="migration-flow-node__icon" aria-hidden="true">
        <DwIcon :name="iconByKind[data.kind]" size="xs" :stroke-width="1.75"/>
      </span>
      <span
          class="migration-flow-node__status"
          :class="`migration-flow-node__status--${data.status}`"
      >
        {{ data.statusLabel }}
      </span>
    </div>
    <template #handles>
      <Handle
          v-if="data.kind !== 'source'"
          id="in"
          type="target"
          :position="Position.Left"
          class="migration-flow-node__handle"
      />
      <Handle
          v-if="data.kind !== 'target'"
          id="out"
          type="source"
          :position="Position.Right"
          class="migration-flow-node__handle"
      />
    </template>
  </DwGraphNodeShell>
</template>

<style scoped>
.migration-flow-node {
  box-sizing: border-box;
  height: v-bind(nodeHeightCss);
  min-height: v-bind(nodeHeightCss);
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  cursor: pointer;
  overflow: hidden;
}

.migration-flow-node :deep(.dw-graph-node-shell__badge),
.migration-flow-node :deep(.dw-graph-node-shell__title),
.migration-flow-node :deep(.dw-graph-node-shell__subtitle),
.migration-flow-node :deep(.dw-graph-node-shell__body) {
  flex-shrink: 0;
}

.migration-flow-node :deep(.dw-graph-node-shell__title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: normal;
  line-height: 1.35;
  min-height: 1.35em;
}

.migration-flow-node :deep(.dw-graph-node-shell__subtitle) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.35;
  min-height: 1.35em;
}

.migration-flow-node :deep(.dw-graph-node-shell__body) {
  margin-top: auto;
}

.migration-flow-node__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-sm);
}

.migration-flow-node__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-icon-size-xl);
  height: var(--dw-icon-size-xl);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, var(--dw-bg-panel));
  color: var(--dw-text-secondary);
  flex-shrink: 0;
}

.migration-flow-node__status {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: var(--dw-radius-pill);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg-muted);
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--dw-text-secondary);
  white-space: nowrap;
}

.migration-flow-node__status--ready {
  color: var(--dw-success);
  border-color: color-mix(in srgb, var(--dw-success) 35%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-success) 12%, var(--dw-bg-panel));
}

.migration-flow-node__status--incomplete {
  color: var(--mp-tone-amber, var(--dw-warning));
  border-color: color-mix(in srgb, var(--mp-tone-amber, var(--dw-warning)) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--mp-tone-amber, var(--dw-warning)) 12%, var(--dw-bg-panel));
}

.migration-flow-node__handle {
  width: var(--dw-icon-size-xs) !important;
  height: var(--dw-icon-size-xs) !important;
  background: var(--dw-bg-panel) !important;
  border: 1.5px solid var(--dw-border) !important;
}

:deep(.migration-flow-node--ready.dw-graph-node-shell) {
  border-color: color-mix(in srgb, var(--dw-success) 40%, var(--dw-border));
}

:deep(.migration-flow-node--incomplete.dw-graph-node-shell:not(.is-selected)) {
  border-color: color-mix(in srgb, var(--mp-tone-amber, var(--dw-warning)) 45%, var(--dw-border));
}
</style>
