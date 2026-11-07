import {resolveUserStorageKey} from '@/shared/config/app-config-storage-scope'

export const ASSISTANT_FLOAT_GEOMETRY_KEY = 'dw-cli-ai-assistant-float'

export type AssistantFloatGeometry = {
    x: number
    y: number
    w: number
    h: number
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

/** Read last free-float assistant geometry for the current user scope. */
export function readAssistantFloatGeometry(): AssistantFloatGeometry | null {
    if (typeof localStorage === 'undefined') return null
    try {
        const raw = localStorage.getItem(resolveUserStorageKey(ASSISTANT_FLOAT_GEOMETRY_KEY))
        if (!raw) return null
        const parsed = JSON.parse(raw) as Record<string, unknown>
        if (
            !isFiniteNumber(parsed.x)
            || !isFiniteNumber(parsed.y)
            || !isFiniteNumber(parsed.w)
            || !isFiniteNumber(parsed.h)
        ) {
            return null
        }
        return {x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h}
    } catch {
        return null
    }
}

/** Persist free-float assistant geometry (debounced by callers if needed). */
export function writeAssistantFloatGeometry(geometry: AssistantFloatGeometry): void {
    if (typeof localStorage === 'undefined') return
    try {
        localStorage.setItem(
            resolveUserStorageKey(ASSISTANT_FLOAT_GEOMETRY_KEY),
            JSON.stringify(geometry),
        )
    } catch {
        // Quota / private mode — ignore.
    }
}

/** Clamp a saved rect into the current viewport. */
export function clampAssistantFloatGeometry(
    geometry: AssistantFloatGeometry,
    bounds: {minW: number; maxW: number; minH: number; maxH: number},
): AssistantFloatGeometry {
    const w = Math.min(bounds.maxW, Math.max(bounds.minW, geometry.w))
    const h = Math.min(bounds.maxH, Math.max(bounds.minH, geometry.h))
    const maxX = Math.max(0, window.innerWidth - w)
    const maxY = Math.max(0, window.innerHeight - h)
    return {
        w,
        h,
        x: Math.min(maxX, Math.max(0, geometry.x)),
        y: Math.min(maxY, Math.max(0, geometry.y)),
    }
}
