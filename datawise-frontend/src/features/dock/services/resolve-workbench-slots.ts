import type {DockPlacement} from '@/features/dock/types/dock.types'

export interface WorkbenchSlotVisibility {
    showExplorer: boolean
    showTerminal: boolean
    showShortcut: boolean
}

/**
 * Resolved workbench chrome slots for a placement + visibility snapshot.
 * Pure: no store access — MainContent renders from this; tests cover layout rules.
 */
export interface WorkbenchSlots {
    /** Shortcut tool window docked on the left (stripe stays on the right). */
    shortcutLeft: boolean
    /** Shortcut tool window docked on the right (beside the fixed stripe). */
    shortcutRight: boolean
    shortcutFloat: boolean
    /** Icon stripe — always on the right when the shortcut rail is visible. */
    shortcutStripe: boolean
    explorerLeft: boolean
    explorerRight: boolean
    explorerFloat: boolean
    terminalBottom: boolean
    terminalRight: boolean
    terminalFloat: boolean
    workspaceFloat: boolean
    /** Right column hosts explorer and/or terminal. */
    rightDock: boolean
    /** Explorer + terminal both on the right → vertical split. */
    rightDockSplit: boolean
}

export function resolveWorkbenchSlots(
    placement: DockPlacement,
    visibility: WorkbenchSlotVisibility,
): WorkbenchSlots {
    const explorerLeft = visibility.showExplorer && placement.explorer === 'left'
    const explorerRight = visibility.showExplorer && placement.explorer === 'right'
    const explorerFloat = visibility.showExplorer && placement.explorer === 'float'

    const terminalBottom = visibility.showTerminal && placement.terminal === 'bottom'
    const terminalRight = visibility.showTerminal && placement.terminal === 'right'
    const terminalFloat = visibility.showTerminal && placement.terminal === 'float'

    const shortcutLeft = visibility.showShortcut && placement.shortcut === 'left'
    const shortcutRight = visibility.showShortcut && placement.shortcut === 'right'
    const shortcutFloat = visibility.showShortcut && placement.shortcut === 'float'
    const shortcutStripe = visibility.showShortcut

    const workspaceFloat = placement.workspace === 'float'

    return {
        shortcutLeft,
        shortcutRight,
        shortcutFloat,
        shortcutStripe,
        explorerLeft,
        explorerRight,
        explorerFloat,
        terminalBottom,
        terminalRight,
        terminalFloat,
        workspaceFloat,
        rightDock: explorerRight || terminalRight,
        rightDockSplit: explorerRight && terminalRight,
    }
}
