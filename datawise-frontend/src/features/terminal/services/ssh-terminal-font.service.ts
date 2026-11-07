import type {Terminal} from '@xterm/xterm'
import {
    TERMINAL_FONT_SIZE_BASE,
    TERMINAL_FONT_SIZE_MAX,
    TERMINAL_FONT_SIZE_MIN,
    clampTerminalFontSize,
    resolveScaledTerminalFontSize,
} from '@/shared/config/terminal-font-size'

/** Relative offset from shell-scaled base (follows uiTextScale). */
const FONT_DELTA_KEY = 'dw-cli-ssh-terminal-font-delta'
/** @deprecated absolute px; migrated once into FONT_DELTA_KEY */
const LEGACY_ABS_KEY = 'ssh-terminal-font-size'

function readDelta(): number {
    try {
        const raw = localStorage.getItem(FONT_DELTA_KEY)
        if (raw != null && raw !== '') {
            const parsed = Number.parseInt(raw, 10)
            return Number.isFinite(parsed) ? parsed : 0
        }
        // One-shot migrate absolute override → delta vs current scaled base.
        const legacy = localStorage.getItem(LEGACY_ABS_KEY)
        if (legacy != null && legacy !== '') {
            const abs = Number.parseInt(legacy, 10)
            if (Number.isFinite(abs)) {
                const base = resolveScaledTerminalFontSize(TERMINAL_FONT_SIZE_BASE)
                const delta = Math.round(abs - base)
                localStorage.setItem(FONT_DELTA_KEY, String(delta))
                localStorage.removeItem(LEGACY_ABS_KEY)
                return delta
            }
        }
        return 0
    } catch {
        return 0
    }
}

function writeDelta(delta: number): number {
    const next = Math.round(delta)
    if (next === 0) {
        clearSshTerminalFontOverride()
        return 0
    }
    localStorage.setItem(FONT_DELTA_KEY, String(next))
    try {
        localStorage.removeItem(LEGACY_ABS_KEY)
    } catch {
        /* ignore */
    }
    return next
}

export function hasSshTerminalFontOverride(): boolean {
    try {
        const raw = localStorage.getItem(FONT_DELTA_KEY)
        if (raw != null && raw !== '' && Number.parseInt(raw, 10) !== 0) return true
        return Boolean(localStorage.getItem(LEGACY_ABS_KEY))
    } catch {
        return false
    }
}

/** Clear A+/A− override so size follows shell uiTextScale again. */
export function clearSshTerminalFontOverride(): void {
    try {
        localStorage.removeItem(FONT_DELTA_KEY)
        localStorage.removeItem(LEGACY_ABS_KEY)
    } catch {
        /* ignore */
    }
}

export function readSshTerminalFontSize(): number {
    const base = resolveScaledTerminalFontSize(TERMINAL_FONT_SIZE_BASE)
    return clampTerminalFontSize(base + readDelta())
}

export function writeSshTerminalFontSize(size: number): number {
    const base = resolveScaledTerminalFontSize(TERMINAL_FONT_SIZE_BASE)
    const normalized = clampTerminalFontSize(size)
    writeDelta(normalized - base)
    return normalized
}

export function adjustSshTerminalFontSize(current: number, delta: number): number {
    return writeSshTerminalFontSize(current + delta)
}

export function resetSshTerminalFontSize(terminal: Terminal | null = null): number {
    clearSshTerminalFontOverride()
    const size = readSshTerminalFontSize()
    if (terminal) terminal.options.fontSize = size
    return size
}

export function applyTerminalFontSize(terminal: Terminal | null, size: number): number {
    const normalized = writeSshTerminalFontSize(size)
    if (terminal) {
        terminal.options.fontSize = normalized
    }
    return normalized
}

export const SSH_TERMINAL_FONT_LIMITS = {
    min: TERMINAL_FONT_SIZE_MIN,
    max: TERMINAL_FONT_SIZE_MAX,
    default: TERMINAL_FONT_SIZE_BASE,
} as const
