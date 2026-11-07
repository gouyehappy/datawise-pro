import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {createPinia, setActivePinia} from 'pinia'
import {resolveWorkbenchSlots} from '@/features/dock/services/resolve-workbench-slots'
import {ensureShortcutFloatContent} from '@/features/dock/services/ensure-shortcut-float-content'
import {
    DEFAULT_DOCK_FLOATS,
    DEFAULT_DOCK_PLACEMENT,
    isClassicDockPlacement,
    normalizeDockPlacement,
    normalizePanelFloat,
    pinDockPanelPlacement,
    floatDockPanelPlacement,
    type DockPlacement,
} from '@/features/dock/types/dock.types'
import {DOCK_MINIMAP_DROP_SIDES, isMinimapDropSide, toDockDropTarget} from '@/features/dock/components/dock-minimap.config'
import {normalizeLayout} from '@/shared/config/app-config.service'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {DOCK_DROP_ZONE_Z_INDEX, DOCK_FLOAT_STACK_SPAN, DOCK_FLOAT_Z_INDEX} from '@/features/dock/dock-z'

const ALL_VISIBLE = {showExplorer: true, showTerminal: true, showShortcut: true} as const

describe('dock placement', () => {
    it('defaults to classic explorer-left terminal-bottom shortcut-right workspace-center', () => {
        assert.deepEqual(DEFAULT_DOCK_PLACEMENT, {
            explorer: 'left',
            terminal: 'bottom',
            shortcut: 'right',
            workspace: 'center',
        })
        assert.equal(isClassicDockPlacement(DEFAULT_DOCK_PLACEMENT), true)
    })

    it('normalizes invalid placement values to classic', () => {
        assert.deepEqual(normalizeDockPlacement(null), DEFAULT_DOCK_PLACEMENT)
        assert.deepEqual(normalizeDockPlacement(undefined), DEFAULT_DOCK_PLACEMENT)
        assert.deepEqual(
            normalizeDockPlacement({explorer: 'nope' as 'left', terminal: 'float'}),
            {explorer: 'left', terminal: 'float', shortcut: 'right', workspace: 'center'},
        )
    })

    it('accepts explorer float and shortcut left placement', () => {
        assert.deepEqual(
            normalizeDockPlacement({explorer: 'float', terminal: 'bottom', shortcut: 'left'}),
            {explorer: 'float', terminal: 'bottom', shortcut: 'left', workspace: 'center'},
        )
    })

    it('normalizeLayout treats missing dockPlacement as null (classic)', () => {
        const layout = normalizeLayout({showExplorerPanel: true})
        assert.equal(layout.dockPlacement, null)
        assert.equal(layout.dockTerminalFloat, null)
        assert.equal(layout.dockExplorerFloat, null)
        assert.equal(layout.dockShortcutFloat, null)
        assert.equal(layout.dockWorkspaceFloat, null)
    })

    it('normalizeLayout preserves valid dockPlacement', () => {
        const layout = normalizeLayout({
            dockPlacement: {explorer: 'right', terminal: 'float', shortcut: 'left', workspace: 'float'},
        })
        assert.deepEqual(layout.dockPlacement, {
            explorer: 'right',
            terminal: 'float',
            shortcut: 'left',
            workspace: 'float',
        })
        assert.equal(isClassicDockPlacement(layout.dockPlacement!), false)
    })

    it('normalizePanelFloat clamps per-panel bounds', () => {
        assert.deepEqual(
            normalizePanelFloat('terminal', {x: -10, y: 5, width: 10, height: 9999}),
            {x: 0, y: 5, width: 360, height: 1200},
        )
        assert.deepEqual(normalizePanelFloat('terminal', null), DEFAULT_DOCK_FLOATS.terminal)
        assert.deepEqual(
            normalizePanelFloat('explorer', {x: -5, y: 8, width: 40, height: 9999}),
            {x: 0, y: 8, width: 180, height: 1400},
        )
        assert.deepEqual(normalizePanelFloat('explorer', null), DEFAULT_DOCK_FLOATS.explorer)
    })

    it('normalizeLayout preserves dock float rects', () => {
        const layout = normalizeLayout({
            dockTerminalFloat: {x: 40, y: 80, width: 700, height: 300},
            dockExplorerFloat: {x: 20, y: 40, width: 280, height: 500},
        })
        assert.deepEqual(layout.dockTerminalFloat, {x: 40, y: 80, width: 700, height: 300})
        assert.deepEqual(layout.dockExplorerFloat, {x: 20, y: 40, width: 280, height: 500})
    })

    it('resolveWorkbenchSlots maps classic placement', () => {
        assert.deepEqual(resolveWorkbenchSlots(DEFAULT_DOCK_PLACEMENT, ALL_VISIBLE), {
            shortcutLeft: false,
            shortcutRight: true,
            shortcutFloat: false,
            shortcutStripe: true,
            explorerLeft: true,
            explorerRight: false,
            explorerFloat: false,
            terminalBottom: true,
            terminalRight: false,
            terminalFloat: false,
            workspaceFloat: false,
            rightDock: false,
            rightDockSplit: false,
        })
    })

    it('resolveWorkbenchSlots respects visibility gates', () => {
        const slots = resolveWorkbenchSlots(DEFAULT_DOCK_PLACEMENT, {
            showExplorer: false,
            showTerminal: false,
            showShortcut: false,
        })
        assert.equal(slots.explorerLeft, false)
        assert.equal(slots.terminalBottom, false)
        assert.equal(slots.shortcutRight, false)
        assert.equal(slots.shortcutStripe, false)
    })

    it('resolveWorkbenchSlots detects right dock vertical split', () => {
        const placement: DockPlacement = {
            explorer: 'right',
            terminal: 'right',
            shortcut: 'left',
            workspace: 'center',
        }
        const slots = resolveWorkbenchSlots(placement, ALL_VISIBLE)
        assert.equal(slots.explorerRight, true)
        assert.equal(slots.terminalRight, true)
        assert.equal(slots.shortcutLeft, true)
        assert.equal(slots.shortcutStripe, true)
        assert.equal(slots.rightDock, true)
        assert.equal(slots.rightDockSplit, true)
        assert.equal(slots.terminalBottom, false)
    })

    it('resolveWorkbenchSlots marks float panels', () => {
        const placement: DockPlacement = {
            explorer: 'float',
            terminal: 'float',
            shortcut: 'float',
            workspace: 'float',
        }
        const slots = resolveWorkbenchSlots(placement, ALL_VISIBLE)
        assert.equal(slots.explorerFloat, true)
        assert.equal(slots.terminalFloat, true)
        assert.equal(slots.shortcutFloat, true)
        assert.equal(slots.shortcutStripe, true)
        assert.equal(slots.workspaceFloat, true)
        assert.equal(slots.rightDock, false)
        assert.equal(slots.rightDockSplit, false)
    })

    it('clampDockFloatToViewport keeps the window on-screen', async () => {
        const {clampDockFloatToViewport, placeDockFloatInViewport} = await import(
            '@/features/dock/types/dock.types'
        )
        const prev = globalThis.window
        // @ts-expect-error test shim
        globalThis.window = {innerWidth: 1440, innerHeight: 900}
        try {
            assert.deepEqual(
                clampDockFloatToViewport({x: 2000, y: 950, width: 360, height: 520}, 48),
                {x: 1080, y: 380, width: 360, height: 520},
            )
            assert.deepEqual(
                clampDockFloatToViewport({x: 951, y: 48, width: 560, height: 1077}, 48),
                {x: 880, y: 48, width: 560, height: 852},
            )
            const placed = placeDockFloatInViewport('shortcut', {width: 360, height: 520})
            assert.equal(placed.width, 360)
            assert.equal(placed.height, 520)
            assert.ok(placed.x >= 0 && placed.x + placed.width <= 1440)
            assert.ok(placed.y >= 0 && placed.y + placed.height <= 900)
            // Stagger: shortcut is offset right of center, not pinned to a minimap cursor.
            const centerX = (1440 - 360) / 2
            assert.ok(placed.x > centerX)

            // Docked full-height dump must not become a near-fullscreen float.
            const explorerPlaced = placeDockFloatInViewport('explorer', {
                x: 951,
                y: 48,
                width: 560,
                height: 1077,
            })
            assert.ok(explorerPlaced.height <= Math.round(900 * 0.72))
            assert.ok(explorerPlaced.width <= 300)
            assert.ok(explorerPlaced.x + explorerPlaced.width <= 1440)
        } finally {
            globalThis.window = prev
        }
    })

    it('clamp / place leave float rects alone on a tiny or boot-size window', async () => {
        const {clampDockFloatToViewport, placeDockFloatInViewport} = await import(
            '@/features/dock/types/dock.types'
        )
        const prev = globalThis.window
        const rect = {x: 670, y: 212, width: 300, height: 560}
        // @ts-expect-error test shim
        globalThis.window = {innerWidth: 0, innerHeight: 0}
        try {
            assert.deepEqual(clampDockFloatToViewport(rect), rect)
            assert.deepEqual(placeDockFloatInViewport('explorer', rect), {
                x: 670,
                y: 212,
                width: 300,
                height: 560,
            })
        } finally {
            globalThis.window = prev
        }
    })

    it('ensureShortcutFloatContent is a no-op when app-config is unfinished', () => {
        const layout = {showNotificationDrawer: false, activeShortcutPanel: null as string | null}
        const unfinished = {} as {preferences?: unknown; isShortcutVisible?: unknown}
        assert.doesNotThrow(() => ensureShortcutFloatContent(layout as never, unfinished as never))
        assert.equal(layout.activeShortcutPanel, null)

        const missingFn = {preferences: {lastShortcutPanel: 'info'}}
        assert.doesNotThrow(() => ensureShortcutFloatContent(layout as never, missingFn as never))
        assert.equal(layout.activeShortcutPanel, null)
    })

    it('ensureShortcutFloatContent restores the last visible shortcut panel', () => {
        const layout = {showNotificationDrawer: false, activeShortcutPanel: null as string | null}
        const appConfig = {
            preferences: {lastShortcutPanel: 'history'},
            isShortcutVisible: (id: string) => id === 'history',
        }
        ensureShortcutFloatContent(layout as never, appConfig as never)
        assert.equal(layout.activeShortcutPanel, 'history')
    })

    it('repairLoadedFloats does not persist stacked floats on a tiny window', () => {
        setActivePinia(createPinia())
        const dock = useDockPlacementStore()
        dock.setExplorerSide('float')
        dock.setTerminalSide('float')
        const prev = globalThis.window
        try {
            // @ts-expect-error test shim
            globalThis.window = {innerWidth: 1440, innerHeight: 900}
            dock.applyFloat('explorer', {x: 900, y: 48, width: 300, height: 560})
            dock.applyFloat('terminal', {x: 900, y: 200, width: 400, height: 280})
            const before = {
                explorer: {...dock.floats.explorer},
                terminal: {...dock.floats.terminal},
            }
            // @ts-expect-error test shim
            globalThis.window = {innerWidth: 80, innerHeight: 80}
            assert.equal(dock.repairLoadedFloats(), false)
            assert.deepEqual(dock.floats.explorer, before.explorer)
            assert.deepEqual(dock.floats.terminal, before.terminal)
        } finally {
            globalThis.window = prev
        }
    })

    it('repairLoadedFloats unstacks piled floats in a normal viewport', () => {
        setActivePinia(createPinia())
        const dock = useDockPlacementStore()
        dock.setExplorerSide('float')
        dock.setTerminalSide('float')
        const prev = globalThis.window
        // @ts-expect-error test shim
        globalThis.window = {innerWidth: 1440, innerHeight: 900}
        try {
            dock.applyFloat('explorer', {x: 900, y: 48, width: 300, height: 560})
            dock.applyFloat('terminal', {x: 900, y: 200, width: 400, height: 280})
            assert.equal(dock.repairLoadedFloats(), true)
            assert.ok(Math.abs(dock.floats.explorer.x - dock.floats.terminal.x) >= 96)
            assert.ok(dock.floats.explorer.width >= 180)
            assert.ok(dock.floats.terminal.width >= 360)
        } finally {
            globalThis.window = prev
        }
    })

    it('pinDockPanelPlacement restores one panel to classic without touching others', () => {
        const floated: DockPlacement = {
            explorer: 'float',
            terminal: 'float',
            shortcut: 'float',
            workspace: 'float',
        }
        assert.deepEqual(pinDockPanelPlacement(floated, 'explorer'), {
            explorer: 'left',
            terminal: 'float',
            shortcut: 'float',
            workspace: 'float',
        })
        assert.deepEqual(pinDockPanelPlacement(floated, 'terminal'), {
            explorer: 'float',
            terminal: 'bottom',
            shortcut: 'float',
            workspace: 'float',
        })
        assert.deepEqual(pinDockPanelPlacement(floated, 'shortcut'), {
            explorer: 'float',
            terminal: 'float',
            shortcut: 'right',
            workspace: 'float',
        })
        assert.deepEqual(pinDockPanelPlacement(floated, 'workspace'), {
            explorer: 'float',
            terminal: 'float',
            shortcut: 'float',
            workspace: 'center',
        })
        assert.deepEqual(pinDockPanelPlacement(floated, 'explorer').terminal, 'float')
        assert.equal(isClassicDockPlacement(pinDockPanelPlacement(DEFAULT_DOCK_PLACEMENT, 'workspace')), true)
    })

    it('minimap drop sides stay a subset of each panel’s allowed docks', () => {
        assert.deepEqual(DOCK_MINIMAP_DROP_SIDES.explorer, ['left', 'right', 'float'])
        assert.deepEqual(DOCK_MINIMAP_DROP_SIDES.terminal, ['bottom', 'right', 'float'])
        assert.deepEqual(DOCK_MINIMAP_DROP_SIDES.shortcut, ['left', 'right', 'float'])
        assert.deepEqual(DOCK_MINIMAP_DROP_SIDES.workspace, ['center', 'float'])
        assert.equal(isMinimapDropSide('workspace', 'left'), false)
        assert.equal(isMinimapDropSide('workspace', 'center'), true)
        assert.equal(isMinimapDropSide('terminal', 'left'), false)
        assert.equal(isMinimapDropSide('explorer', 'bottom'), false)
        assert.deepEqual(toDockDropTarget('workspace', 'center'), {panel: 'workspace', side: 'center'})
        assert.equal(toDockDropTarget('workspace', 'left'), null)
        assert.deepEqual(toDockDropTarget('terminal', 'bottom'), {panel: 'terminal', side: 'bottom'})
    })

    it('floatDockPanelPlacement detaches one panel without touching others', () => {
        const next = floatDockPanelPlacement(DEFAULT_DOCK_PLACEMENT, 'explorer')
        assert.equal(next.explorer, 'float')
        assert.equal(next.terminal, 'bottom')
        assert.equal(next.shortcut, 'right')
        assert.equal(next.workspace, 'center')
    })

    it('toggleFloatMaximize fills the viewport then restores the previous rect', () => {
        setActivePinia(createPinia())
        const dock = useDockPlacementStore()
        const prev = globalThis.window
        // @ts-expect-error test shim
        globalThis.window = {innerWidth: 1440, innerHeight: 900}
        try {
            dock.setExplorerSide('float')
            dock.applyFloat('explorer', {x: 80, y: 60, width: 300, height: 400})
            const before = {...dock.floats.explorer}
            assert.equal(dock.toggleFloatMaximize('explorer'), true)
            assert.equal(dock.isFloatMaximized('explorer'), true)
            assert.ok(dock.floats.explorer.width > 1000)
            assert.ok(dock.floats.explorer.height > 700)
            assert.equal(dock.toggleFloatMaximize('explorer'), true)
            assert.equal(dock.isFloatMaximized('explorer'), false)
            assert.deepEqual(dock.floats.explorer, before)
        } finally {
            globalThis.window = prev
        }
    })

    it('syncFloatsToViewport reclamps off-screen floats and re-fills maximized ones', () => {
        setActivePinia(createPinia())
        const dock = useDockPlacementStore()
        const prev = globalThis.window
        // @ts-expect-error test shim
        globalThis.window = {innerWidth: 1920, innerHeight: 1080}
        try {
            dock.setExplorerSide('float')
            dock.setTerminalSide('float')
            dock.applyFloat('explorer', {x: 1600, y: 80, width: 300, height: 400})
            dock.applyFloat('terminal', {x: 100, y: 100, width: 640, height: 280})
            dock.toggleFloatMaximize('terminal')
            assert.equal(dock.isFloatMaximized('terminal'), true)

            // @ts-expect-error test shim
            globalThis.window = {innerWidth: 1100, innerHeight: 680}
            assert.equal(dock.syncFloatsToViewport(), true)

            const explorer = dock.floats.explorer
            assert.ok(explorer.x >= 0)
            assert.ok(explorer.y >= 0)
            assert.ok(explorer.x + explorer.width <= 1100)
            assert.ok(explorer.y + explorer.height <= 680)

            const terminal = dock.floats.terminal
            assert.equal(dock.isFloatMaximized('terminal'), true)
            assert.ok(terminal.width >= 1000)
            assert.ok(terminal.height >= 600)
            assert.ok(terminal.x + terminal.width <= 1100)
            assert.ok(terminal.y + terminal.height <= 680)
        } finally {
            globalThis.window = prev
        }
    })

    it('syncFloatsToViewport is a no-op on boot-size windows', () => {
        setActivePinia(createPinia())
        const dock = useDockPlacementStore()
        const prev = globalThis.window
        // @ts-expect-error test shim
        globalThis.window = {innerWidth: 1440, innerHeight: 900}
        try {
            dock.setExplorerSide('float')
            dock.applyFloat('explorer', {x: 80, y: 60, width: 300, height: 400})
            const before = {...dock.floats.explorer}
            // @ts-expect-error test shim
            globalThis.window = {innerWidth: 0, innerHeight: 0}
            assert.equal(dock.syncFloatsToViewport(), false)
            assert.deepEqual(dock.floats.explorer, before)
        } finally {
            globalThis.window = prev
        }
    })

    it('pinning back a maximized float clears maximize state', () => {
        setActivePinia(createPinia())
        const dock = useDockPlacementStore()
        const prev = globalThis.window
        // @ts-expect-error test shim
        globalThis.window = {innerWidth: 1440, innerHeight: 900}
        try {
            dock.setTerminalSide('float')
            dock.toggleFloatMaximize('terminal')
            assert.equal(dock.isFloatMaximized('terminal'), true)
            dock.setTerminalSide('bottom')
            assert.equal(dock.isFloatMaximized('terminal'), false)
        } finally {
            globalThis.window = prev
        }
    })

    it('raiseFloat puts the panel above other floats without exceeding the stack span', () => {
        setActivePinia(createPinia())
        const dock = useDockPlacementStore()
        const explorerZ = dock.floatZIndex('explorer')
        dock.raiseFloat('shortcut')
        dock.raiseFloat('explorer')
        assert.ok(dock.floatZIndex('explorer') > dock.floatZIndex('shortcut'))
        assert.ok(dock.floatZIndex('explorer') > explorerZ)
        assert.ok(dock.floatZIndex('explorer') <= DOCK_FLOAT_Z_INDEX + DOCK_FLOAT_STACK_SPAN - 1)
        assert.ok(dock.floatZIndex('explorer') < DOCK_DROP_ZONE_Z_INDEX)
        const top = dock.floatZIndex('explorer')
        dock.raiseFloat('explorer')
        assert.equal(dock.floatZIndex('explorer'), top)
        dock.resetToClassic()
        assert.equal(dock.floatZIndex('explorer'), DOCK_FLOAT_Z_INDEX)
    })
})
