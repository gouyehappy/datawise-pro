/** Floating workspace-tab windows (inside `.workspace-body`, not OS windows). */

export interface WorkspaceTabFloatRect {
    x: number
    y: number
    width: number
    height: number
}

export interface WorkspaceTabFloatState extends WorkspaceTabFloatRect {
    zIndex: number
    minimized?: boolean
    maximized?: boolean
    /** Restored size after leaving maximized. */
    restoreRect?: WorkspaceTabFloatRect
}

export type WorkspaceTabPaneMode = 'main' | 'float' | 'hidden'

export type WorkspaceTabFloatMap = Record<string, WorkspaceTabFloatState>

export const TAB_FLOAT_MIN_WIDTH = 320
export const TAB_FLOAT_MIN_HEIGHT = 200
export const TAB_FLOAT_DEFAULT_WIDTH = 520
export const TAB_FLOAT_DEFAULT_HEIGHT = 360
export const TAB_FLOAT_MINIMIZED_HEIGHT = 36

const FLOAT_STAGGER = {dx: 28, dy: 28}

export function clampTabFloatToBounds(
    rect: WorkspaceTabFloatRect,
    bounds: {width: number; height: number},
    margin = 8,
): WorkspaceTabFloatRect {
    const maxW = Math.max(TAB_FLOAT_MIN_WIDTH, bounds.width - margin * 2)
    const maxH = Math.max(TAB_FLOAT_MIN_HEIGHT, bounds.height - margin * 2)
    const width = Math.min(Math.max(TAB_FLOAT_MIN_WIDTH, Math.round(rect.width)), maxW)
    const height = Math.min(Math.max(TAB_FLOAT_MIN_HEIGHT, Math.round(rect.height)), maxH)
    const maxX = Math.max(0, bounds.width - width)
    const maxY = Math.max(0, bounds.height - Math.min(height, TAB_FLOAT_MINIMIZED_HEIGHT))
    return {
        width,
        height,
        x: Math.min(Math.max(0, Math.round(rect.x)), maxX),
        y: Math.min(Math.max(0, Math.round(rect.y)), maxY),
    }
}

/** Place a new float with a light stagger so windows do not stack perfectly. */
export function placeNewTabFloat(
    existingCount: number,
    bounds: {width: number; height: number},
    preferred?: Partial<WorkspaceTabFloatRect> | null,
): WorkspaceTabFloatRect {
    const width = preferred?.width ?? Math.min(TAB_FLOAT_DEFAULT_WIDTH, Math.max(TAB_FLOAT_MIN_WIDTH, bounds.width - 48))
    const height = preferred?.height ?? Math.min(TAB_FLOAT_DEFAULT_HEIGHT, Math.max(TAB_FLOAT_MIN_HEIGHT, bounds.height - 48))
    const stagger = existingCount % 8
    const baseX = preferred?.x ?? Math.max(16, (bounds.width - width) / 2 - 40 + stagger * FLOAT_STAGGER.dx)
    const baseY = preferred?.y ?? Math.max(16, (bounds.height - height) / 2 - 24 + stagger * FLOAT_STAGGER.dy)
    return clampTabFloatToBounds({x: baseX, y: baseY, width, height}, bounds)
}

export function clientPointToFloatOrigin(
    clientX: number,
    clientY: number,
    boundsRect: DOMRect,
    size: {width: number; height: number} = {
        width: TAB_FLOAT_DEFAULT_WIDTH,
        height: TAB_FLOAT_DEFAULT_HEIGHT,
    },
): WorkspaceTabFloatRect {
    return clampTabFloatToBounds(
        {
            x: clientX - boundsRect.left - 24,
            y: clientY - boundsRect.top - 12,
            width: size.width,
            height: size.height,
        },
        {width: boundsRect.width, height: boundsRect.height},
    )
}

export type TabFloatSnapEdge =
    | 'left'
    | 'right'
    | 'top'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'

export interface TabFloatSnapGuide {
    edge: TabFloatSnapEdge
    rect: WorkspaceTabFloatRect
}

const SNAP_EDGE_PX = 28
const SNAP_CORNER_PX = 40

export const TAB_FLOAT_OPACITY_MIN = 0.55
export const TAB_FLOAT_OPACITY_MAX = 1
export const TAB_FLOAT_OPACITY_DEFAULT = 1

export function clampTabFloatOpacity(value: unknown): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : TAB_FLOAT_OPACITY_DEFAULT
    return Math.min(TAB_FLOAT_OPACITY_MAX, Math.max(TAB_FLOAT_OPACITY_MIN, Math.round(n * 100) / 100))
}

function quarterRect(
    bounds: {width: number; height: number},
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
    margin = 8,
): WorkspaceTabFloatRect {
    const gap = margin
    const width = Math.floor((bounds.width - margin * 3) / 2)
    const height = Math.floor((bounds.height - margin * 3) / 2)
    const x = corner.endsWith('left') ? margin : bounds.width - margin - width
    const y = corner.startsWith('top') ? margin : bounds.height - margin - height
    return clampTabFloatToBounds({x, y, width, height}, bounds, gap)
}

/** Preview / commit half-screen, corner quarter, or maximize snap while dragging. */
export function resolveTabFloatSnap(
    rect: WorkspaceTabFloatRect,
    bounds: {width: number; height: number},
    threshold = SNAP_EDGE_PX,
): TabFloatSnapGuide | null {
    const margin = 8
    const nearLeft = rect.x <= SNAP_CORNER_PX
    const nearRight = rect.x + rect.width >= bounds.width - SNAP_CORNER_PX
    const nearTop = rect.y <= SNAP_CORNER_PX
    const nearBottom = rect.y + rect.height >= bounds.height - SNAP_CORNER_PX

    // Corners first — quarter screens.
    if (nearTop && nearLeft) {
        return {edge: 'top-left', rect: quarterRect(bounds, 'top-left', margin)}
    }
    if (nearTop && nearRight) {
        return {edge: 'top-right', rect: quarterRect(bounds, 'top-right', margin)}
    }
    if (nearBottom && nearLeft) {
        return {edge: 'bottom-left', rect: quarterRect(bounds, 'bottom-left', margin)}
    }
    if (nearBottom && nearRight) {
        return {edge: 'bottom-right', rect: quarterRect(bounds, 'bottom-right', margin)}
    }

    // Top edge (not in a corner) → maximize.
    if (rect.y <= threshold) {
        return {
            edge: 'top',
            rect: clampTabFloatToBounds(
                {
                    x: margin,
                    y: margin,
                    width: bounds.width - margin * 2,
                    height: bounds.height - margin * 2,
                },
                bounds,
                margin,
            ),
        }
    }
    if (rect.x <= threshold) {
        return {
            edge: 'left',
            rect: clampTabFloatToBounds(
                {
                    x: margin,
                    y: margin,
                    width: Math.floor((bounds.width - margin * 3) / 2),
                    height: bounds.height - margin * 2,
                },
                bounds,
                margin,
            ),
        }
    }
    if (rect.x + rect.width >= bounds.width - threshold) {
        const width = Math.floor((bounds.width - margin * 3) / 2)
        return {
            edge: 'right',
            rect: clampTabFloatToBounds(
                {
                    x: bounds.width - margin - width,
                    y: margin,
                    width,
                    height: bounds.height - margin * 2,
                },
                bounds,
                margin,
            ),
        }
    }
    return null
}

export type TabFloatArrangeMode = 'tile' | 'cascade'

/** Even grid of open (non-minimized) floats. */
export function layoutTabFloatsTile(
    count: number,
    bounds: {width: number; height: number},
): WorkspaceTabFloatRect[] {
    if (count <= 0) return []
    const margin = 10
    const gap = 8
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const cellW = Math.floor((bounds.width - margin * 2 - gap * (cols - 1)) / cols)
    const cellH = Math.floor((bounds.height - margin * 2 - gap * (rows - 1)) / rows)
    const out: WorkspaceTabFloatRect[] = []
    for (let i = 0; i < count; i += 1) {
        const col = i % cols
        const row = Math.floor(i / cols)
        out.push(
            clampTabFloatToBounds(
                {
                    x: margin + col * (cellW + gap),
                    y: margin + row * (cellH + gap),
                    width: cellW,
                    height: cellH,
                },
                bounds,
                margin,
            ),
        )
    }
    return out
}

/** Overlapping cascade — classic window manager look. */
export function layoutTabFloatsCascade(
    count: number,
    bounds: {width: number; height: number},
): WorkspaceTabFloatRect[] {
    if (count <= 0) return []
    const margin = 16
    const step = 28
    const width = Math.min(TAB_FLOAT_DEFAULT_WIDTH, Math.max(TAB_FLOAT_MIN_WIDTH, bounds.width - margin * 2 - step * 3))
    const height = Math.min(TAB_FLOAT_DEFAULT_HEIGHT, Math.max(TAB_FLOAT_MIN_HEIGHT, bounds.height - margin * 2 - step * 3))
    const out: WorkspaceTabFloatRect[] = []
    for (let i = 0; i < count; i += 1) {
        out.push(
            clampTabFloatToBounds(
                {
                    x: margin + (i % 8) * step,
                    y: margin + (i % 8) * step,
                    width,
                    height,
                },
                bounds,
                margin,
            ),
        )
    }
    return out
}

/** Pack minimized title bars into a bottom dock strip. */
export function layoutMinimizedFloatStrip(
    count: number,
    bounds: {width: number; height: number},
    chipWidth = 200,
): WorkspaceTabFloatRect[] {
    if (count <= 0) return []
    const margin = 10
    const gap = 6
    const height = TAB_FLOAT_MINIMIZED_HEIGHT
    const y = Math.max(margin, bounds.height - height - margin)
    const maxW = Math.min(chipWidth, Math.floor((bounds.width - margin * 2 - gap * Math.max(0, count - 1)) / count))
    const width = Math.max(140, maxW)
    const out: WorkspaceTabFloatRect[] = []
    for (let i = 0; i < count; i += 1) {
        out.push({
            x: margin + i * (width + gap),
            y,
            width,
            height,
        })
    }
    return out
}
