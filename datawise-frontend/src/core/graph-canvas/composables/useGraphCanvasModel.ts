import {computed, type Ref} from 'vue'
import type {Edge, Node} from '@vue-flow/core'
import type {GraphCanvasPosition} from '../types'

/**
 * Keep Vue Flow nodes in sync with a position override map (free layout).
 */
export function useGraphCanvasPositions(options: {
  nodes: Ref<Node[]>
  positionOverrides: Ref<Record<string, GraphCanvasPosition>>
}) {
  const positionedNodes = computed(() =>
      options.nodes.value.map((node) => {
        const override = options.positionOverrides.value[node.id]
        if (!override) return node
        return {
          ...node,
          position: {x: override.x, y: override.y},
        }
      }),
  )

  function onNodeDragStop(payload: {node: Node}) {
    const {id, position} = payload.node
    options.positionOverrides.value = {
      ...options.positionOverrides.value,
      [id]: {x: Math.round(position.x), y: Math.round(position.y)},
    }
  }

  function pruneOverrides(allowedIds: Iterable<string>) {
    const allowed = new Set(allowedIds)
    const next: Record<string, GraphCanvasPosition> = {}
    for (const [id, pos] of Object.entries(options.positionOverrides.value)) {
      if (allowed.has(id)) next[id] = pos
    }
    options.positionOverrides.value = next
  }

  function resetOverrides() {
    options.positionOverrides.value = {}
  }

  return {
    positionedNodes,
    onNodeDragStop,
    pruneOverrides,
    resetOverrides,
  }
}

export function mapSimpleEdges(
    edges: Array<{id: string; source: string; target: string; label?: string}>,
): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    animated: false,
  }))
}
