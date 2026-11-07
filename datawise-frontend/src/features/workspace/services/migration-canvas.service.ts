export type MigrationCanvasNodeKind = 'source' | 'tables' | 'mode' | 'target'

export type MigrationCanvasNodeStatus = 'ready' | 'incomplete' | 'idle'

export interface MigrationCanvasNode {
    id: MigrationCanvasNodeKind
    kind: MigrationCanvasNodeKind
    title: string
    subtitle: string
    badge: string
    status: MigrationCanvasNodeStatus
    x: number
    y: number
    width: number
    height: number
}

export interface MigrationCanvasEdge {
    id: string
    fromId: MigrationCanvasNodeKind
    toId: MigrationCanvasNodeKind
    label: string
    animated?: boolean
}

export interface MigrationCanvasLayout {
    nodes: MigrationCanvasNode[]
    edges: MigrationCanvasEdge[]
}

export type MigrationCanvasPositionOverrides = Record<string, {x: number; y: number}>

const NODE_W = 168
const NODE_H = 96
const GAP_X = 64
const PAD = 28
const NODE_Y = 36

const NODE_ORDER: MigrationCanvasNodeKind[] = ['source', 'tables', 'mode', 'target']

export function resolveMigrationNodeStatuses(input: {
    hasSource: boolean
    selectedTableCount: number
    targetConnectionId: string
    targetDatabase: string
}): Record<MigrationCanvasNodeKind, MigrationCanvasNodeStatus> {
    return {
        source: input.hasSource ? 'ready' : 'incomplete',
        tables: input.selectedTableCount > 0 ? 'ready' : 'incomplete',
        mode: 'ready',
        target:
            input.targetConnectionId.trim() && input.targetDatabase.trim()
                ? 'ready'
                : 'incomplete',
    }
}

export function layoutMigrationCanvas(input: {
    sourceLabel: string
    sourceDatabase: string
    selectedTableCount: number
    modeLabel: string
    targetLabel: string
    targetDatabase: string
    labels: {
        sourceBadge: string
        tablesBadge: string
        modeBadge: string
        targetBadge: string
        tablesSubtitle: string
        tablesEmpty: string
        targetEmpty: string
        edgeRead: string
        edgeTables: string
        edgeWrite: string
    }
    statuses: Record<MigrationCanvasNodeKind, MigrationCanvasNodeStatus>
    positionOverrides?: MigrationCanvasPositionOverrides
}): MigrationCanvasLayout {
    const overrides = input.positionOverrides ?? {}
    const nodes: MigrationCanvasNode[] = NODE_ORDER.map((kind, index) => {
        const override = overrides[kind]
        const base = {
            id: kind,
            kind,
            status: input.statuses[kind],
            x: override?.x ?? PAD + index * (NODE_W + GAP_X),
            y: override?.y ?? NODE_Y,
            width: NODE_W,
            height: NODE_H,
        }
        switch (kind) {
            case 'source':
                return {
                    ...base,
                    badge: input.labels.sourceBadge,
                    title: input.sourceLabel || '—',
                    subtitle: input.sourceDatabase || '—',
                }
            case 'tables':
                return {
                    ...base,
                    badge: input.labels.tablesBadge,
                    title: input.labels.tablesSubtitle,
                    subtitle:
                        input.selectedTableCount > 0
                            ? String(input.selectedTableCount)
                            : input.labels.tablesEmpty,
                }
            case 'mode':
                return {
                    ...base,
                    badge: input.labels.modeBadge,
                    title: input.modeLabel,
                    subtitle: '',
                }
            case 'target':
                return {
                    ...base,
                    badge: input.labels.targetBadge,
                    title: input.targetLabel || input.labels.targetEmpty,
                    subtitle: input.targetDatabase || '—',
                }
        }
    })

    const allReady = NODE_ORDER.every((kind) => input.statuses[kind] === 'ready')
    const edges: MigrationCanvasEdge[] = [
        {
            id: 'edge-source-tables',
            fromId: 'source',
            toId: 'tables',
            label: input.labels.edgeRead,
        },
        {
            id: 'edge-tables-mode',
            fromId: 'tables',
            toId: 'mode',
            label:
                input.selectedTableCount > 0
                    ? input.labels.edgeTables.replace('{count}', String(input.selectedTableCount))
                    : '',
        },
        {
            id: 'edge-mode-target',
            fromId: 'mode',
            toId: 'target',
            label: input.labels.edgeWrite,
            animated: allReady,
        },
    ]

    return {nodes, edges}
}

export function nextIncompleteMigrationNode(
    statuses: Record<MigrationCanvasNodeKind, MigrationCanvasNodeStatus>,
    preferred: MigrationCanvasNodeKind = 'tables',
): MigrationCanvasNodeKind {
    if (statuses[preferred] === 'incomplete') return preferred
    for (const kind of NODE_ORDER) {
        if (statuses[kind] === 'incomplete') return kind
    }
    return preferred
}

export {NODE_W as MIGRATION_CANVAS_NODE_W, NODE_H as MIGRATION_CANVAS_NODE_H}
