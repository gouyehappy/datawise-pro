<script setup lang="ts">
/**
 * Lightweight cell text. Avoids per-cell Shadow DOM (thousands of shadow roots
 * made pageSize=200 grids lag on scroll/page flip). 划词 suppression stays on
 * useSuppressSelectionPlugins at the grid root.
 */
defineProps<{
  text: string
  isNull?: boolean
  backing?: boolean
  wrap?: boolean
}>()
</script>

<template>
  <span
      class="cell-text dw-grid-cell-text"
      :class="{
        'is-null': isNull,
        'is-backing': backing,
        'is-wrap': wrap,
      }"
      aria-hidden="true"
  >{{ text || '\u00a0' }}</span>
</template>

<style scoped>
.dw-grid-cell-text {
  display: block;
  height: var(--dw-control-h-sm);
  line-height: var(--dw-control-h-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: cell;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
  font: inherit;
  color: inherit;
}

.dw-grid-cell-text.is-wrap {
  height: auto;
  line-height: var(--dw-leading, 1.5);
  padding: var(--dw-space-2) 0;
  overflow: visible;
  text-overflow: unset;
  white-space: pre-wrap;
  word-break: break-word;
}

.dw-grid-cell-text.is-null {
  color: var(--dw-text-muted);
  font-style: italic;
}

.dw-grid-cell-text.is-backing {
  color: transparent !important;
}
</style>
