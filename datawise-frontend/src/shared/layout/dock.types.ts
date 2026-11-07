export type ExplorerDockSide = 'left' | 'right' | 'float'
export type TerminalDockSide = 'bottom' | 'right' | 'float'
export type ShortcutDockSide = 'left' | 'right' | 'float'
export type WorkspaceDockSide = 'center' | 'float'

export type DockDragPanel = 'explorer' | 'terminal' | 'shortcut' | 'workspace'

export const DOCK_DRAG_PANELS: readonly DockDragPanel[] = [
    'explorer',
    'terminal',
    'shortcut',
    'workspace',
] as const

export interface DockPlacement {
    explorer: ExplorerDockSide
    terminal: TerminalDockSide
    shortcut: ShortcutDockSide
    workspace: WorkspaceDockSide
}

export interface DockFloatRect {
    x: number
    y: number
    width: number
    height: number
}

export type DockFloatMap = Record<DockDragPanel, DockFloatRect>

export type DockDropTarget =
    | {panel: 'explorer'; side: ExplorerDockSide}
    | {panel: 'terminal'; side: TerminalDockSide}
    | {panel: 'shortcut'; side: ShortcutDockSide}
    | {panel: 'workspace'; side: WorkspaceDockSide}

export const DEFAULT_DOCK_PLACEMENT: DockPlacement = {
    explorer: 'left',
    terminal: 'bottom',
    shortcut: 'right',
    workspace: 'center',
}

/** Pin one panel back to its classic side; leave the others unchanged. */
export function pinDockPanelPlacement(placement: DockPlacement, panel: DockDragPanel): DockPlacement {
    switch (panel) {
        case 'explorer':
            return {...placement, explorer: DEFAULT_DOCK_PLACEMENT.explorer}
        case 'terminal':
            return {...placement, terminal: DEFAULT_DOCK_PLACEMENT.terminal}
        case 'shortcut':
            return {...placement, shortcut: DEFAULT_DOCK_PLACEMENT.shortcut}
        case 'workspace':
            return {...placement, workspace: DEFAULT_DOCK_PLACEMENT.workspace}
    }
}

/** Detach one panel into a float; leave the others unchanged. */
export function floatDockPanelPlacement(placement: DockPlacement, panel: DockDragPanel): DockPlacement {
    return {...placement, [panel]: 'float'}
}

export const DEFAULT_DOCK_FLOATS: DockFloatMap = {
    terminal: {x: 120, y: 120, width: 640, height: 280},
    explorer: {x: 72, y: 88, width: 300, height: 560},
    /** Tool window only — icon stripe stays docked on the workbench. */
    shortcut: {x: 420, y: 96, width: 340, height: 520},
    workspace: {x: 160, y: 72, width: 960, height: 640},
}

/** @deprecated Prefer DEFAULT_DOCK_FLOATS.terminal */
export const DEFAULT_DOCK_FLOAT = DEFAULT_DOCK_FLOATS.terminal
/** @deprecated Prefer DEFAULT_DOCK_FLOATS.explorer */
export const DEFAULT_EXPLORER_FLOAT = DEFAULT_DOCK_FLOATS.explorer
/** @deprecated Prefer DEFAULT_DOCK_FLOATS.shortcut */
export const DEFAULT_SHORTCUT_FLOAT = DEFAULT_DOCK_FLOATS.shortcut
/** @deprecated Prefer DEFAULT_DOCK_FLOATS.workspace */
export const DEFAULT_WORKSPACE_FLOAT = DEFAULT_DOCK_FLOATS.workspace

const FLOAT_BOUNDS: Record<DockDragPanel, {minW: number; maxW: number; minH: number; maxH: number}> = {
    terminal: {minW: 360, maxW: 2400, minH: 160, maxH: 1200},
    explorer: {minW: 180, maxW: 560, minH: 240, maxH: 1400},
    shortcut: {minW: 220, maxW: 720, minH: 280, maxH: 1400},
    workspace: {minW: 480, maxW: 2400, minH: 320, maxH: 1600},
}

export function isExplorerDockSide(value: unknown): value is ExplorerDockSide {
    return value === 'left' || value === 'right' || value === 'float'
}

export function isTerminalDockSide(value: unknown): value is TerminalDockSide {
    return value === 'bottom' || value === 'right' || value === 'float'
}

export function isShortcutDockSide(value: unknown): value is ShortcutDockSide {
    return value === 'left' || value === 'right' || value === 'float'
}

export function isWorkspaceDockSide(value: unknown): value is WorkspaceDockSide {
    return value === 'center' || value === 'float'
}

export function normalizeDockPlacement(raw: Partial<DockPlacement> | null | undefined): DockPlacement {
    return {
        explorer: isExplorerDockSide(raw?.explorer) ? raw.explorer : DEFAULT_DOCK_PLACEMENT.explorer,
        terminal: isTerminalDockSide(raw?.terminal) ? raw.terminal : DEFAULT_DOCK_PLACEMENT.terminal,
        shortcut: isShortcutDockSide(raw?.shortcut) ? raw.shortcut : DEFAULT_DOCK_PLACEMENT.shortcut,
        workspace: isWorkspaceDockSide(raw?.workspace) ? raw.workspace : DEFAULT_DOCK_PLACEMENT.workspace,
    }
}

function clampFloatDim(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
    return Math.min(max, Math.max(min, Math.round(n)))
}

/** Keep the float window on-screen (shrink if needed). No-op outside the browser. */
export function clampDockFloatToViewport(rect: DockFloatRect, margin = 48): DockFloatRect {
    if (typeof window === 'undefined') return rect
    // Boot / hidden windows often report 0×0 — never persist those into layout.
    if (window.innerWidth < 320 || window.innerHeight < 240) return rect
    const maxW = Math.max(margin, window.innerWidth - margin)
    const maxH = Math.max(margin, window.innerHeight - margin)
    const width = Math.min(Math.max(1, Math.round(rect.width)), maxW)
    const height = Math.min(Math.max(1, Math.round(rect.height)), maxH)
    const maxX = Math.max(0, window.innerWidth - width)
    const maxY = Math.max(0, window.innerHeight - height)
    return {
        width,
        height,
        x: Math.min(Math.max(0, Math.round(rect.x)), maxX),
        y: Math.min(Math.max(0, Math.round(rect.y)), maxY),
    }
}

/** Per-panel offset from viewport center so multiple floats don't stack on the minimap cursor. */
const FLOAT_ENTER_STAGGER: Record<DockDragPanel, {dx: number; dy: number}> = {
    explorer: {dx: -140, dy: -24},
    terminal: {dx: 100, dy: 110},
    shortcut: {dx: 160, dy: 36},
    workspace: {dx: -48, dy: -36},
}

/**
 * Place a float in the viewport center (with a per-panel stagger).
 * Ignore pointer anchor — dropping on the minimap float zone would pile every panel on the right.
 * Oversized preferred sizes (e.g. docked full-height) fall back to the panel default.
 */
export function placeDockFloatInViewport(
    panel: DockDragPanel,
    preferred?: Partial<DockFloatRect> | null,
    _anchor?: {x: number; y: number} | null,
): DockFloatRect {
    const fallback = DEFAULT_DOCK_FLOATS[panel]
    const base = normalizePanelFloat(panel, preferred)
    if (typeof window === 'undefined') return base
    // Boot / hidden windows often report 0×0 — keep the preferred size, do not shrink to 0.
    if (window.innerWidth < 320 || window.innerHeight < 240) return base
    let {width, height} = base
    const maxComfortH = Math.round(window.innerHeight * 0.72)
    const maxComfortW = Math.round(window.innerWidth * 0.55)
    // Full-height dock dumps also tend to carry an awkward width — reset both.
    if (height > maxComfortH) {
        height = Math.min(fallback.height, maxComfortH)
        width = fallback.width
    } else if (width > maxComfortW) {
        width = Math.min(fallback.width, maxComfortW)
    }
    const stagger = FLOAT_ENTER_STAGGER[panel]
    const x = (window.innerWidth - width) / 2 + stagger.dx
    const y = (window.innerHeight - height) / 2 + stagger.dy
    return clampDockFloatToViewport({...base, width, height, x, y})
}

/**
 * Fill the viewport (session maximize). Skips per-panel max width so explorer
 * can actually go wide; clampDockFloatToViewport still keeps it on-screen.
 */
export function maximizeDockFloatInViewport(margin = 16): DockFloatRect {
    if (typeof window === 'undefined' || window.innerWidth < 320 || window.innerHeight < 240) {
        return {x: 16, y: 16, width: 960, height: 640}
    }
    const width = Math.max(1, window.innerWidth - margin * 2)
    const height = Math.max(1, window.innerHeight - margin * 2)
    return clampDockFloatToViewport({x: margin, y: margin, width, height}, 0)
}

/** Normalize one panel's float rect (null/invalid → panel default). */
export function normalizePanelFloat(
    panel: DockDragPanel,
    raw: Partial<DockFloatRect> | null | undefined,
): DockFloatRect {
    const fallback = DEFAULT_DOCK_FLOATS[panel]
    const bounds = FLOAT_BOUNDS[panel]
    if (raw == null || typeof raw !== 'object') return {...fallback}
    return {
        x: clampFloatDim(raw.x, fallback.x, 0, 10_000),
        y: clampFloatDim(raw.y, fallback.y, 0, 10_000),
        width: clampFloatDim(raw.width, fallback.width, bounds.minW, bounds.maxW),
        height: clampFloatDim(raw.height, fallback.height, bounds.minH, bounds.maxH),
    }
}

export function cloneDefaultDockFloats(): DockFloatMap {
    return {
        terminal: {...DEFAULT_DOCK_FLOATS.terminal},
        explorer: {...DEFAULT_DOCK_FLOATS.explorer},
        shortcut: {...DEFAULT_DOCK_FLOATS.shortcut},
        workspace: {...DEFAULT_DOCK_FLOATS.workspace},
    }
}

/** @deprecated Prefer normalizePanelFloat('terminal', raw) */
export function normalizeDockFloatRect(raw: Partial<DockFloatRect> | null | undefined): DockFloatRect {
    return normalizePanelFloat('terminal', raw)
}

/** @deprecated Prefer normalizePanelFloat('explorer', raw) */
export function normalizeExplorerFloatRect(raw: Partial<DockFloatRect> | null | undefined): DockFloatRect {
    return normalizePanelFloat('explorer', raw)
}

/** @deprecated Prefer normalizePanelFloat('shortcut', raw) */
export function normalizeShortcutFloatRect(raw: Partial<DockFloatRect> | null | undefined): DockFloatRect {
    return normalizePanelFloat('shortcut', raw)
}

/** @deprecated Prefer normalizePanelFloat('workspace', raw) */
export function normalizeWorkspaceFloatRect(raw: Partial<DockFloatRect> | null | undefined): DockFloatRect {
    return normalizePanelFloat('workspace', raw)
}

export function isClassicDockPlacement(placement: DockPlacement): boolean {
    return placement.explorer === DEFAULT_DOCK_PLACEMENT.explorer
        && placement.terminal === DEFAULT_DOCK_PLACEMENT.terminal
        && placement.shortcut === DEFAULT_DOCK_PLACEMENT.shortcut
        && placement.workspace === DEFAULT_DOCK_PLACEMENT.workspace
}
