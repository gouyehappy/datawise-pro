import type {
    DockDragPanel,
    DockDropTarget,
    ExplorerDockSide,
    ShortcutDockSide,
    TerminalDockSide,
    WorkspaceDockSide,
} from '@/features/dock/types/dock.types'

export type MinimapDropSide = 'left' | 'right' | 'bottom' | 'center' | 'float'

export interface MinimapFrameSlot {
    side: Exclude<MinimapDropSide, 'float'>
    /** Editor chrome sketch (tabs + lines). */
    showTabs?: boolean
}

/** Classic workbench silhouette — always the same; only allowed sides light up. */
export const DOCK_MINIMAP_FRAME_SLOTS: readonly MinimapFrameSlot[] = [
    {side: 'left'},
    {side: 'center', showTabs: true},
    {side: 'right'},
    {side: 'bottom'},
]

export const DOCK_MINIMAP_FLOAT_SIDE = 'float' as const satisfies MinimapDropSide

export const DOCK_MINIMAP_TITLE_KEY: Record<DockDragPanel, string> = {
    explorer: 'dock.minimap.explorerTitle',
    terminal: 'dock.minimap.terminalTitle',
    shortcut: 'dock.minimap.shortcutTitle',
    workspace: 'dock.minimap.workspaceTitle',
}

export const DOCK_MINIMAP_DROP_SIDES: Record<DockDragPanel, readonly MinimapDropSide[]> = {
    explorer: ['left', 'right', 'float'],
    shortcut: ['left', 'right', 'float'],
    terminal: ['bottom', 'right', 'float'],
    workspace: ['center', 'float'],
}

const LABEL_BY_SIDE: Record<MinimapDropSide, string> = {
    left: 'dock.minimap.left',
    right: 'dock.minimap.right',
    bottom: 'dock.minimap.bottom',
    center: 'dock.minimap.center',
    float: 'dock.minimap.float',
}

export function isMinimapDropSide(panel: DockDragPanel, side: string): side is MinimapDropSide {
    return (DOCK_MINIMAP_DROP_SIDES[panel] as readonly string[]).includes(side)
}

/** Narrow panel+side into the store's discriminated {@link DockDropTarget}. */
export function toDockDropTarget(panel: DockDragPanel, side: string): DockDropTarget | null {
    if (!isMinimapDropSide(panel, side)) return null
    switch (panel) {
        case 'explorer':
            return isExplorerSide(side) ? {panel, side} : null
        case 'terminal':
            return isTerminalSide(side) ? {panel, side} : null
        case 'shortcut':
            return isShortcutSide(side) ? {panel, side} : null
        case 'workspace':
            return isWorkspaceSide(side) ? {panel, side} : null
    }
}

function isExplorerSide(side: MinimapDropSide): side is ExplorerDockSide {
    return side === 'left' || side === 'right' || side === 'float'
}

function isTerminalSide(side: MinimapDropSide): side is TerminalDockSide {
    return side === 'bottom' || side === 'right' || side === 'float'
}

function isShortcutSide(side: MinimapDropSide): side is ShortcutDockSide {
    return side === 'left' || side === 'right' || side === 'float'
}

function isWorkspaceSide(side: MinimapDropSide): side is WorkspaceDockSide {
    return side === 'center' || side === 'float'
}

export function minimapSideLabelKey(side: string): string | null {
    return side in LABEL_BY_SIDE ? LABEL_BY_SIDE[side as MinimapDropSide] : null
}
