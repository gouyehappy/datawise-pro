import {
    registerPluginHooks,
    unregisterPluginHooks,
} from '@/features/plugin/services/plugin-hook.service'
import {readDesktopBridge} from '@/features/layout/services/desktop-bridge'
import type {PluginHookHandlers} from '@/features/plugin/types/plugin-hook.types'

function installDatawiseHost(host: NonNullable<Window['datawise']>): void {
    try {
        Object.defineProperty(window, 'datawise', {
            value: host,
            configurable: true,
            writable: true,
        })
        return
    } catch {
        // Older preload builds exposed window.datawise as a read-only bridge.
    }

    try {
        window.datawise = host
    } catch {
        // Keep the renderer alive even if an installed app has a non-writable bridge.
    }
}

export function installPluginHookHost(): void {
    if (typeof window === 'undefined') return

    const hooks = {
        registerPluginHooks: (pluginId: string, handlers: PluginHookHandlers) => {
            registerPluginHooks(pluginId, handlers)
        },
        unregisterPluginHooks: (pluginId: string) => {
            unregisterPluginHooks(pluginId)
        },
    }

    const bridge = readDesktopBridge()
    const existing = window.datawise
    if (bridge || existing) {
        installDatawiseHost({
            ...bridge,
            ...existing,
            ...hooks,
            platform: bridge?.platform ?? existing?.platform ?? 'web',
        })
        return
    }

    installDatawiseHost({
        platform: 'web',
        ...hooks,
    })
}