import type {Edge, Node} from '@vue-flow/core'

/** Stable product-facing aliases (prefer these over importing @vue-flow in features). */
export type GraphCanvasNode = Node
export type GraphCanvasEdge = Edge

export type GraphCanvasPosition = {x: number; y: number}

export type DwErTableColumn = {
  name: string
  dataType?: string
  keyType?: string | null
  highlighted?: boolean
}

export type DwGraphCanvasLabels = {
  fitView?: string
  zoomIn?: string
  zoomOut?: string
}
