import type {WindowPreferences} from '@/shared/config/app-config.types'
import {normalizeWindow} from '@/shared/config/app-config.service'
import {toWindowStatePayload} from '@/features/layout/services/desktop-window-state.service'

export function setupDesktopWindowSync(options: {
    getWindow: () => WindowPreferences | undefined
    onWindowChange: (window: WindowPreferences) => void
    applyInitial: (window: WindowPreferences) => void
}) {
    const api = window.datawise?.window
    if (!api) return

    void (async () => {
        try {
            // Host window-state.json is authoritative on desktop — never overwrite it
            // with app-config defaults on boot (that caused visible size jumps).
            const current = await api.getState()
            if (current?.width && current?.height) {
                options.applyInitial(normalizeWindow(current))
                return
            }
            const saved = options.getWindow()
            if (saved?.width && saved?.height) {
                await api.setState(toWindowStatePayload(saved))
            }
        } catch (error) {
            console.warn('[desktop] window state sync skipped', error)
        }
    })()

    api.onStateChange((state) => {
        options.onWindowChange(state)
    })
}
