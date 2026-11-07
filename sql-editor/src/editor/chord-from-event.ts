import {normalizeKeyChord, parseKeyChord} from '@sql-editor/editor/shortcut-config'

const MODIFIER_ONLY = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])

/** 将浏览器 KeyboardEvent 转为配置用组合键字符串（如 Ctrl+Shift+D） */
export function keyboardEventToKeyChord(event: KeyboardEvent): string | null {
    if (MODIFIER_ONLY.has(event.key)) return null

    const token = resolveEventKeyToken(event)
    if (!token) return null

    const parts: string[] = []
    if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
    if (event.shiftKey) parts.push('Shift')
    if (event.altKey) parts.push('Alt')
    parts.push(token)

    const normalized = normalizeKeyChord(parts.join('+'))
    return parseKeyChord(normalized) === null ? null : normalized
}

function resolveEventKeyToken(event: KeyboardEvent): string | null {
    const {key, code} = event

    if (key === ' ') return 'Space'
    if (key === '/') return '/'
    if (key === 'ArrowUp') return 'Up'
    if (key === 'ArrowDown') return 'Down'
    if (key === 'ArrowLeft') return 'Left'
    if (key === 'ArrowRight') return 'Right'
    if (key === 'Delete') return 'Delete'
    if (key === 'Backspace') return 'Backspace'
    if (key === 'Tab') return 'Tab'
    if (key === 'Enter') return 'Enter'
    if (/^F\d{1,2}$/i.test(key)) return key.toUpperCase()
    if (key.length === 1 && /[a-z0-9]/i.test(key)) return key.toUpperCase()

    if (code.startsWith('Key') && code.length === 4) return code.slice(3)
    if (code.startsWith('Digit') && code.length === 6) return code.slice(5)
    if (code === 'Slash') return '/'
    if (code === 'Space') return 'Space'

    return null
}

/** 录制过程中展示按下的修饰键（尚未形成完整组合） */
export function previewKeyChordFromEvent(event: KeyboardEvent): string {
    const parts: string[] = []
    if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
    if (event.shiftKey) parts.push('Shift')
    if (event.altKey) parts.push('Alt')
    const token = resolveEventKeyToken(event)
    if (token && !MODIFIER_ONLY.has(event.key)) parts.push(token)
    return parts.length ? normalizeKeyChord(parts.join('+')) : ''
}
