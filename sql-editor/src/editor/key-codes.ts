/**
 * Monaco KeyMod / KeyCode 子集（与 monaco-editor 枚举值一致）。
 * 供 shortcut-config 在 Node 测试环境解析 chord，避免 import monaco-editor。
 */
export const KeyMod = {
    CtrlCmd: 2048,
    Shift: 1024,
    Alt: 512,
} as const

const LETTER_BASE = 31
const DIGIT_BASE = 21
const F_BASE = 59

function letterKeyCode(ch: string): number {
    return LETTER_BASE + (ch.toUpperCase().charCodeAt(0) - 65)
}

function digitKeyCode(d: string): number {
    return DIGIT_BASE + Number(d)
}

function functionKeyCode(name: string): number | null {
    const match = /^F(\d{1,2})$/i.exec(name)
    if (!match) return null
    const n = Number(match[1])
    if (n < 1 || n > 24) return null
    return F_BASE + (n - 1)
}

export const KeyCode = {
    Backspace: 1,
    Tab: 2,
    Enter: 3,
    Escape: 9,
    Space: 10,
    UpArrow: 16,
    LeftArrow: 15,
    RightArrow: 17,
    DownArrow: 18,
    Delete: 20,
    /** Monaco KeyCode.Comma */
    Comma: 87,
    Slash: 90,
} as const

export const NAMED_KEY_CODES: Record<string, number> = {
    up: KeyCode.UpArrow,
    down: KeyCode.DownArrow,
    left: KeyCode.LeftArrow,
    right: KeyCode.RightArrow,
    slash: KeyCode.Slash,
    '/': KeyCode.Slash,
    comma: KeyCode.Comma,
    ',': KeyCode.Comma,
    space: KeyCode.Space,
    tab: KeyCode.Tab,
    enter: KeyCode.Enter,
    escape: KeyCode.Escape,
    backspace: KeyCode.Backspace,
    delete: KeyCode.Delete,
}

export function resolveKeyToken(token: string): number | null {
    const t = token.trim()
    if (!t) return null
    const lower = t.toLowerCase()
    if (NAMED_KEY_CODES[lower] !== undefined) return NAMED_KEY_CODES[lower]
    if (/^[a-z]$/i.test(t)) return letterKeyCode(t)
    if (/^\d$/.test(t)) return digitKeyCode(t)
    return functionKeyCode(t)
}

/** 解析按键串为 KeyMod | KeyCode 位掩码 */
export function parseKeyChordBits(chord: string): number | null {
    const parts = chord.split('+').map((p) => p.trim()).filter(Boolean)
    if (!parts.length) return null

    let mod = 0
    let key: number | null = null

    for (const part of parts) {
        const lower = part.toLowerCase()
        if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'meta' || lower === 'command') {
            mod |= KeyMod.CtrlCmd
            continue
        }
        if (lower === 'shift') {
            mod |= KeyMod.Shift
            continue
        }
        if (lower === 'alt' || lower === 'option') {
            mod |= KeyMod.Alt
            continue
        }
        const resolved = resolveKeyToken(part)
        if (resolved === null) return null
        if (key !== null) return null
        key = resolved
    }

    if (key === null) return null
    return mod | key
}
