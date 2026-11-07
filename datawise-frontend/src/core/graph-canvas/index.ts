/**
 * Generic graph canvas — Vue Flow engine + Dw skin.
 *
 * Prefer importing from `@/core/graph-canvas`.
 * Canonical package: `@datawise/graph-canvas` (Phase 6). Host keeps local copies
 * so deep `.vue` path imports stay stable until cutover.
 * Business graphs (VQB / ER / lineage) live in features.
 */

export * from './types'
export * from './composables/useGraphCanvasModel'

export {default as DwGraphCanvas} from './components/DwGraphCanvas.vue'
export {default as DwGraphNodeShell} from './components/DwGraphNodeShell.vue'
export {default as DwErTableNode} from './components/DwErTableNode.vue'

export {
  Handle,
  Position,
  MarkerType,
  useVueFlow,
} from '@vue-flow/core'
export type {
  Node,
  Edge,
  Connection,
  NodeMouseEvent,
  EdgeMouseEvent,
  NodeDragEvent,
  NodeTypesObject,
  EdgeTypesObject,
} from '@vue-flow/core'
