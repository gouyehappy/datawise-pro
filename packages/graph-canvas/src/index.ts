/**
 * @datawise/graph-canvas
 *
 * Canonical package for DwGraphCanvas / DwGraphNodeShell / useGraphCanvasModel.
 * Host `datawise-frontend/src/core/graph-canvas` keeps local copies for deep `.vue`
 * imports until cutover; prefer this package for new consumers.
 */

export * from './types'
export * from './composables/useGraphCanvasModel'
export {usePageLocalActive} from './composables/usePageLocalActive'
export {
  createSpacePanKeyFilter,
  isEditableDomElement,
  isTypingKeyboardEvent,
} from './utils/graphCanvasKeyScope'

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
