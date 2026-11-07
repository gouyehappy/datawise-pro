import {nextTick} from 'vue'

/**
 * Selection range for inline rename / create: files select the stem (before last
 * extension); folders and extensionless / leading-dot names select the whole value.
 */
export function renameSelectionRange(
    name: string,
    options?: {isDirectory?: boolean},
): {start: number; end: number} {
    const value = name ?? ''
    if (!value) return {start: 0, end: 0}
    if (options?.isDirectory) return {start: 0, end: value.length}
    const dot = value.lastIndexOf('.')
    // No extension, or leading-dot only (e.g. `.env`) → select all.
    if (dot <= 0) return {start: 0, end: value.length}
    return {start: 0, end: dot}
}

/** Ignore outside-click commit briefly after arming (menu teardown / focus churn). */
export const INLINE_OUTSIDE_COMMIT_ARM_MS = 100

/** ContextMenuHost v-if-unmounts; focus-scope teardown runs after this tick. */
export async function waitForContextMenuTeardown(): Promise<void> {
    await nextTick()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

export async function runAfterContextMenuClose(
    action: () => void | Promise<void>,
): Promise<void> {
    await waitForContextMenuTeardown()
    await action()
}

export type InlineRenameFocusOptions = {
    resolveEl: () => HTMLInputElement | null
    getName: () => string
    isDirectory: () => boolean
    assignRef?: (el: HTMLInputElement) => void
}

function applyRenameSelection(
    el: HTMLInputElement,
    name: string,
    isDirectory: boolean,
): boolean {
    if (!el.isConnected || !name) return false
    // Controlled :value can lag one frame — wait until DOM catches up.
    if (el.value !== name) return false
    const {start, end} = renameSelectionRange(name, {isDirectory})
    el.focus({preventScroll: true})
    el.setSelectionRange(start, end)
    return (
        document.activeElement === el
        && el.selectionStart === start
        && el.selectionEnd === end
    )
}

export function applyInlineRenameOnFocus(
    event: FocusEvent,
    options: Pick<InlineRenameFocusOptions, 'getName' | 'isDirectory'>,
): void {
    const el = event.target
    if (!(el instanceof HTMLInputElement)) return
    const tryApply = () =>
        applyRenameSelection(el, options.getName() || el.value, options.isDirectory())
    requestAnimationFrame(() => {
        tryApply()
        requestAnimationFrame(() => tryApply())
    })
}

export async function focusInlineRenameInput(
    options: InlineRenameFocusOptions,
): Promise<boolean> {
    const tryOnce = (): boolean => {
        const el = options.resolveEl()
        if (!el?.isConnected) return false
        options.assignRef?.(el)
        const name = options.getName() || el.value
        if (!applyRenameSelection(el, name, options.isDirectory())) return false
        requestAnimationFrame(() => {
            applyRenameSelection(el, options.getName() || el.value, options.isDirectory())
            requestAnimationFrame(() =>
                applyRenameSelection(el, options.getName() || el.value, options.isDirectory()),
            )
        })
        return true
    }

    for (let i = 0; i < 16; i += 1) {
        await nextTick()
        if (tryOnce()) return true
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    return false
}

export async function focusInlineRenameAfterMenu(
    options: InlineRenameFocusOptions,
): Promise<void> {
    await waitForContextMenuTeardown()
    if (await focusInlineRenameInput(options)) return
    await new Promise<void>((resolve) => setTimeout(resolve, 32))
    await focusInlineRenameInput(options)
}
