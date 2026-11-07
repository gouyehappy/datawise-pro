import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'

const ZOOM_STEP = 0.5
const ZOOM_MIN = -5
const ZOOM_MAX = 5

export function canDesktopZoom(): boolean {
    const browser = readDatawiseHost()?.browser
    return Boolean(browser?.setZoomLevel && browser?.getZoomLevel)
}

export async function desktopZoomIn(): Promise<boolean> {
    return adjustDesktopZoom(ZOOM_STEP)
}

export async function desktopZoomOut(): Promise<boolean> {
    return adjustDesktopZoom(-ZOOM_STEP)
}

export async function desktopZoomReset(): Promise<boolean> {
    const host = readDatawiseHost()
    if (!host?.browser?.setZoomLevel) {
        return false
    }
    await host.browser.setZoomLevel(0)
    return true
}

async function adjustDesktopZoom(delta: number): Promise<boolean> {
    const host = readDatawiseHost()
    if (!host?.browser?.getZoomLevel || !host.browser.setZoomLevel) {
        return false
    }
    const current = Number(await host.browser.getZoomLevel())
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (Number.isFinite(current) ? current : 0) + delta))
    await host.browser.setZoomLevel(next)
    return true
}
