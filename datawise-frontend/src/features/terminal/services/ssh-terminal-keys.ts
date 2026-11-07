/**
 * SSH terminal key routing for JCEF/desktop (Xshell-like).
 * Separates clipboard shortcuts from PTY control keys (e.g. bare Ctrl+C = interrupt,
 * bare Ctrl+Z = SIGTSTP / suspend — stops foreground jobs like `tail -f`).
 */
export type SshTerminalKeyAction =
    | {type: 'pass'}
    | {type: 'prevent-and-pass'}
    | {type: 'copy'}
    | {type: 'paste'}
    | {type: 'search'}
    | {type: 'save-selection'}
    /** Send SUB (^Z) to PTY; block browser/CEF Undo. */
    | {type: 'suspend'}

export type SshTerminalKeyContext = {
    hasSelection: boolean
    canWriteClipboard: boolean
    canReadClipboard: boolean
}

/** Bytes for Ctrl+Z → remote job control (SIGTSTP). */
export function terminalSuspendPayload(): string {
    return '\x1a'
}

/**
 * Bare Ctrl+Z (not Cmd/Meta, not Shift) — Xshell-style suspend.
 * Cmd+Z stays Undo on macOS and must not steal the PTY signal.
 */
export function isTerminalSuspendKey(
    event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): boolean {
    return event.key.toLowerCase() === 'z'
        && event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !event.shiftKey
}

export function resolveSshTerminalKeyAction(
    event: Pick<KeyboardEvent, 'type' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
    ctx: SshTerminalKeyContext,
): SshTerminalKeyAction {
    if (event.type !== 'keydown') return {type: 'pass'}

    const key = event.key.toLowerCase()
    const mod = event.ctrlKey || event.metaKey

    // Tab / Shift+Tab: block browser focus traversal; let xterm emit to PTY.
    if (key === 'tab' && !mod && !event.altKey) {
        return {type: 'prevent-and-pass'}
    }

    // Ctrl+Z before other mod handling — must not become browser Undo.
    if (isTerminalSuspendKey(event)) {
        return {type: 'suspend'}
    }

    if (!mod || event.altKey) return {type: 'pass'}

    // Ctrl/Cmd+Shift+C/V — dedicated clipboard (never steals interrupt).
    if (event.shiftKey) {
        if (key === 'c' && ctx.canWriteClipboard && ctx.hasSelection) return {type: 'copy'}
        if (key === 'v' && ctx.canReadClipboard) return {type: 'paste'}
        return {type: 'pass'}
    }

    if (key === 'f') return {type: 'search'}
    if (key === 's') return {type: 'save-selection'}

    // Ctrl/Cmd+C: copy only when there is a selection; otherwise pass (^C) to PTY.
    if (key === 'c') {
        if (ctx.hasSelection && ctx.canWriteClipboard) return {type: 'copy'}
        return {type: 'pass'}
    }

    // Ctrl/Cmd+V: paste via desktop bridge when available (JCEF navigator.clipboard is flaky).
    if (key === 'v') {
        if (ctx.canReadClipboard) return {type: 'paste'}
        return {type: 'pass'}
    }

    return {type: 'pass'}
}
