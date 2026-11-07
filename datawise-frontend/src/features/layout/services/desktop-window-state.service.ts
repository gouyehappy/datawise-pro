import type {WindowPreferences} from '@/shared/config/app-config.types'

export type WindowStatePayload = {
    width: number
    height: number
    x: number | null
    y: number | null
    maximized: boolean
}

function sanitizeDimension(value: unknown, fallback: number, min: number, max: number): number {
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num)) return fallback
    return Math.min(max, Math.max(min, Math.round(num)))
}

function sanitizeCoordinate(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function toWindowStatePayload(window: WindowPreferences): WindowStatePayload {
    return {
        width: sanitizeDimension(window.width, 1440, 320, 3840),
        height: sanitizeDimension(window.height, 900, 240, 2160),
        x: sanitizeCoordinate(window.x),
        y: sanitizeCoordinate(window.y),
        maximized: Boolean(window.maximized),
    }
}
