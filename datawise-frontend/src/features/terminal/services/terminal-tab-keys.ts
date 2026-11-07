/**
 * Keep Tab inside an interactive PTY (Xshell-style remote completion).
 * Browser default moves focus to the next control — that must not win.
 */
export function isTerminalTabKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
    return event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey
}

/** Bytes xterm would send for Tab / Shift+Tab when we must inject after refocus. */
export function terminalTabPayload(shiftKey: boolean): string {
    return shiftKey ? '\x1b[Z' : '\t'
}
