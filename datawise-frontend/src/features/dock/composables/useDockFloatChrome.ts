import {computed} from 'vue'
import {
    floatDockPanelPlacement,
    pinDockPanelPlacement,
    type DockDragPanel,
} from '@/features/dock/types/dock.types'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'

/** Pin-back / close / pop-out for dock panels. */
export function useDockFloatChrome(panel: DockDragPanel) {
    const dock = useDockPlacementStore()
    const appConfig = useAppConfigStore()
    const layout = useLayoutStore()

    const isFloating = computed(() => dock.isPanelFloating(panel))
    const isMaximized = computed(() => dock.isFloatMaximized(panel))

    /** Workspace stays visible; close is pin-back. */
    const canClose = panel !== 'workspace'

    function persistPlacement(next: ReturnType<typeof pinDockPanelPlacement>) {
        appConfig.setDockPlacement(next)
    }

    function pinBack() {
        persistPlacement(pinDockPanelPlacement(dock.placement, panel))
    }

    function popOut() {
        if (isFloating.value) return
        dock.prepareEnterFloat(panel)
        persistPlacement(floatDockPanelPlacement(dock.placement, panel))
    }

    function toggleMaximize() {
        if (!isFloating.value) return
        if (dock.toggleFloatMaximize(panel)) appConfig.persistDockLayout()
    }

    function closeFloat() {
        switch (panel) {
            case 'explorer':
                appConfig.setShowExplorerPanel(false)
                return
            case 'terminal':
                layout.closeTerminalPanel()
                return
            case 'shortcut':
                layout.activeShortcutPanel = null
                layout.showNotificationDrawer = false
                layout.showAssistantDrawer = false
                appConfig.setShowShortcutRailStrip(false)
                return
            case 'workspace':
                pinBack()
        }
    }

    return {isFloating, isMaximized, canClose, pinBack, popOut, toggleMaximize, closeFloat}
}
