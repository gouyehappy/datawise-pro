/** Host-backed UI keys (session / onboarding) that survive Chromium origin changes. */
import {readDesktopBridge} from '@/shared/browser/desktop-bridge'

export type DesktopUiKeyPatch = Record<string, string | null | undefined>

export function persistDesktopUiKeys(patch: DesktopUiKeyPatch): void {
    const store = readDesktopBridge()?.uiStore
    if (!store?.persist) return
    void store.persist(patch)
}

export function clearDesktopSessionKeys(): void {
    const store = readDesktopBridge()?.uiStore
    if (!store?.clearSession) return
    void store.clearSession()
}
