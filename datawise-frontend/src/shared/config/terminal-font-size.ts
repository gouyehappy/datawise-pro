/**
 * Terminal (xterm) base font size — follows shell uiTextScale by default.
 * SSH may persist a relative delta (`dw-cli-ssh-terminal-font-delta`);
 * Native / K8s use the scaled default (no extra settings).
 */
import {readDocumentUiTextScaleFactor} from '@/shared/config/ui-text-scale'

export const TERMINAL_FONT_SIZE_BASE = 13
export const TERMINAL_FONT_SIZE_MIN = 11
export const TERMINAL_FONT_SIZE_MAX = 20

export function clampTerminalFontSize(size: number): number {
    if (!Number.isFinite(size)) return TERMINAL_FONT_SIZE_BASE
    return Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(size)))
}

/** Default xterm size for current shell text scale (no local override). */
export function resolveScaledTerminalFontSize(basePx: number = TERMINAL_FONT_SIZE_BASE): number {
    return clampTerminalFontSize(basePx * readDocumentUiTextScaleFactor())
}
