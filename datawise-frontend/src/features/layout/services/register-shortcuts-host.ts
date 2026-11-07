import {registerShortcutDefinitions} from '@datawise/shortcuts'
import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'

let registered = false

/**
 * Push host product shortcut definitions into `@datawise/shortcuts`.
 * Call once at AppShell boot (before / with global action wiring).
 */
export function registerShortcutsHost(): void {
    if (registered) return
    registered = true
    registerShortcutDefinitions(SHORTCUT_DEFINITIONS)
}
