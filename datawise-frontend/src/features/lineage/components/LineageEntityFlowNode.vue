<script setup lang="ts">
import {Handle, Position} from '@vue-flow/core'

export type LineageFlowField = {
  id: string
  label: string
  transform?: boolean
}

defineProps<{
  data: {
    name: string
    side: 'source' | 'output'
    sideLabel: string
    fields: LineageFlowField[]
    activeFieldIds: Set<string>
    hoverId: string | null
    onFieldEnter?: (id: string) => void
    onFieldLeave?: () => void
  }
}>()
</script>

<template>
  <div
      class="lineage-entity-node"
      :class="`lineage-entity-node--${data.side}`"
  >
    <header class="lineage-entity-node__head">
      <span class="lineage-entity-node__side">{{ data.sideLabel }}</span>
      <strong class="lineage-entity-node__name" :title="data.name">{{ data.name }}</strong>
    </header>
    <ul class="lineage-entity-node__fields">
      <li
          v-for="(field, index) in data.fields"
          :key="field.id"
          class="lineage-entity-node__field"
          :class="{
            'is-alt': index % 2 === 1,
            'is-transform': field.transform,
            'is-active': data.activeFieldIds.has(field.id),
            'is-dim': Boolean(data.hoverId) && !data.activeFieldIds.has(field.id),
          }"
          @mouseenter="data.onFieldEnter?.(field.id)"
          @mouseleave="data.onFieldLeave?.()"
      >
        <Handle
            v-if="data.side === 'output'"
            class="lineage-entity-node__handle lineage-entity-node__handle--left"
            type="target"
            :position="Position.Left"
            :id="field.id"
        />
        <span class="lineage-entity-node__label">{{ field.label }}</span>
        <span v-if="field.transform" class="lineage-entity-node__badge" title="?">?</span>
        <Handle
            v-if="data.side === 'source'"
            class="lineage-entity-node__handle lineage-entity-node__handle--right"
            type="source"
            :position="Position.Right"
            :id="field.id"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lineage-entity-node {
  width: 252px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--dw-border) 88%, var(--dw-text));
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow:
      0 1px 2px color-mix(in srgb, var(--dw-text) 6%, transparent),
      0 4px 14px color-mix(in srgb, var(--dw-text) 5%, transparent);
  font-size: var(--dw-text-sm);
}

.lineage-entity-node--source {
  border-color: color-mix(in srgb, var(--dw-info-fg) 22%, var(--dw-border));
}

.lineage-entity-node--output {
  border-color: color-mix(in srgb, var(--dw-primary) 38%, var(--dw-border));
}

.lineage-entity-node__head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 8px 12px 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border) 85%, transparent);
  background: color-mix(in srgb, var(--dw-bg-muted) 55%, var(--dw-bg-panel));
}

.lineage-entity-node--output .lineage-entity-node__head {
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg-panel));
}

.lineage-entity-node__side {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  color: var(--dw-text-muted);
  font-size: var(--dw-font-size-badge);
  font-weight: 650;
  letter-spacing: 0.02em;
  line-height: 18px;
}

.lineage-entity-node--output .lineage-entity-node__side {
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
  color: var(--dw-primary);
}

.lineage-entity-node__name {
  max-width: 100%;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 650;
  line-height: 1.35;
  word-break: break-word;
}

.lineage-entity-node__fields {
  margin: 0;
  padding: 2px 0;
  list-style: none;
}

.lineage-entity-node__field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: var(--dw-control-h);
  padding: 0 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border) 55%, transparent);
  cursor: pointer;
  transition: background 120ms ease, opacity 120ms ease;
}

.lineage-entity-node__field:last-child {
  border-bottom: none;
}

.lineage-entity-node__field.is-alt {
  background: color-mix(in srgb, var(--dw-text) 2.5%, transparent);
}

.lineage-entity-node__field.is-transform:not(.is-active) {
  background: color-mix(in srgb, var(--dw-warning-fg) 5%, transparent);
}

.lineage-entity-node__field:hover:not(.is-active):not(.is-dim) {
  background: color-mix(in srgb, var(--dw-primary) 7%, transparent);
}

.lineage-entity-node__field.is-active {
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
}

.lineage-entity-node--source .lineage-entity-node__field.is-active {
  box-shadow: inset -3px 0 0 var(--dw-primary);
}

.lineage-entity-node--output .lineage-entity-node__field.is-active {
  box-shadow: inset 3px 0 0 var(--dw-primary);
}

.lineage-entity-node__field.is-dim {
  opacity: 0.38;
}

.lineage-entity-node__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text);
  font-variant-numeric: tabular-nums;
}

.lineage-entity-node__badge {
  flex: none;
  color: var(--dw-warning-fg);
  font-weight: 700;
  font-size: var(--dw-text-xs);
  font-style: italic;
}

.lineage-entity-node__handle {
  width: 6px !important;
  height: 6px !important;
  top: 50% !important;
  opacity: 0;
  pointer-events: none;
  background: color-mix(in srgb, var(--dw-info-fg) 40%, var(--dw-bg-panel)) !important;
  border: 1px solid color-mix(in srgb, var(--dw-info-fg) 50%, var(--dw-border)) !important;
  transition: opacity 120ms ease, background 120ms ease, border-color 120ms ease;
}

.lineage-entity-node__field:hover .lineage-entity-node__handle,
.lineage-entity-node__field.is-active .lineage-entity-node__handle {
  opacity: 1;
}

.lineage-entity-node__field.is-active .lineage-entity-node__handle {
  background: var(--dw-primary) !important;
  border-color: var(--dw-primary) !important;
}

.lineage-entity-node__field.is-dim .lineage-entity-node__handle {
  opacity: 0;
}

.lineage-entity-node__handle--left {
  left: -3px !important;
}

.lineage-entity-node__handle--right {
  right: -3px !important;
}
</style>
