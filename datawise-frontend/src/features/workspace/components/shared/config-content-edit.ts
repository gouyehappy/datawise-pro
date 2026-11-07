/** Whether draft differs from the last loaded/saved baseline while editing. */
export function isConfigContentDirty(
    editing: boolean,
    baseline: string | null | undefined,
    draft: string,
): boolean {
    if (!editing) return false
    return draft !== (baseline ?? '')
}

/**
 * Confirm discarding unsaved edits. Returns true when navigation/edit exit may proceed.
 * @param confirmFn injectable for tests (defaults to `window.confirm`)
 */
export function confirmDiscardConfigEdits(
    dirty: boolean,
    message: string,
    confirmFn: (msg: string) => boolean = (msg) =>
        typeof window !== 'undefined' ? window.confirm(msg) : true,
): boolean {
    if (!dirty) return true
    return confirmFn(message)
}
