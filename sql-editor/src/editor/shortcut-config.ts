import type {SqlKeybindingConfig, HintShortcutItem} from '@sql-editor/types'
import {parseKeyChordBits} from '@sql-editor/editor/key-codes'
import {shortcutFiles} from '#shortcut-files'

/** Monaco 内置命令白名单 */
export const SQL_EDITOR_COMMAND_WHITELIST = new Set([
    'editor.action.deleteLines',
    'editor.action.copyLinesDownAction',
    'editor.action.copyLinesUpAction',
    'editor.action.moveLinesUpAction',
    'editor.action.moveLinesDownAction',
    'editor.action.commentLine',
    'editor.action.triggerSuggest',
    'editor.action.formatDocument',
])

/** 编辑器自定义命令（由 SqlMonacoHost 注入 handler，非 Monaco 内置） */
export const SQL_EDITOR_CUSTOM_COMMANDS = new Set([
    'sqlEditor.formatSelection',
    'sqlEditor.toggleAi',
    'sqlEditor.openSettings',
])

export function isSqlEditorCommandAllowed(command: string): boolean {
    const resolved = resolveMonacoEditorCommand(command)
    return SQL_EDITOR_COMMAND_WHITELIST.has(resolved) || SQL_EDITOR_CUSTOM_COMMANDS.has(resolved)
}

/** 历史/文档别名 → Monaco 实际命令 ID */
export const SQL_EDITOR_COMMAND_ALIASES: Record<string, string> = {
    'editor.action.toggleComment': 'editor.action.commentLine',
}

export function resolveMonacoEditorCommand(command: string): string {
    return SQL_EDITOR_COMMAND_ALIASES[command] ?? command
}

export {KeyMod, KeyCode, parseKeyChordBits} from '@sql-editor/editor/key-codes'

/** 解析按键串为 Monaco KeyMod | KeyCode */
export function parseKeyChord(chord: string): number | null {
    return parseKeyChordBits(chord)
}

export function normalizeKeyChord(chord: string): string {
    return chord
        .split('+')
        .map((p) => {
            const lower = p.trim().toLowerCase()
            if (lower === 'control') return 'Ctrl'
            if (lower === 'command' || lower === 'cmd' || lower === 'meta') return 'Ctrl'
            if (lower === 'option') return 'Alt'
            if (lower === 'shift') return 'Shift'
            if (lower === 'alt') return 'Alt'
            if (lower === 'ctrl') return 'Ctrl'
            if (lower === 'up' || lower === 'down' || lower === 'left' || lower === 'right') {
                return lower.charAt(0).toUpperCase() + lower.slice(1)
            }
            if (lower === 'slash' || p.trim() === '/') return '/'
            return p.trim().length === 1 ? p.trim().toUpperCase() : p.trim()
        })
        .join('+')
}

export function keybindingEntryKey(binding: Pick<SqlKeybindingConfig, 'id' | 'keys'>): string {
    return `${binding.id}|${normalizeKeyChord(binding.keys)}`
}

/** 解析 shortcuts-config/*.txt */
export function parseShortcutConfigFile(text: string): SqlKeybindingConfig[] {
    const results: SqlKeybindingConfig[] = []
    let inBindings = false
    let order = 0

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue

        const sectionMatch = /^\[([a-z_]+)\]$/i.exec(line)
        if (sectionMatch) {
            inBindings = sectionMatch[1].toLowerCase() === 'bindings'
            continue
        }
        if (!inBindings) continue

        const parts = line.split('|').map((p) => p.trim())
        if (parts.length < 3) continue

        const [id, command, keys, labelKey] = parts
        if (!id || !command || !keys) continue
        const resolvedCommand = resolveMonacoEditorCommand(command)
        if (!isSqlEditorCommandAllowed(resolvedCommand)) continue
        if (parseKeyChord(keys) === null) continue

        order += 1
        results.push({
            id,
            command: resolvedCommand,
            keys: normalizeKeyChord(keys),
            labelKey: labelKey || `shortcut.${id}`,
            enabled: true,
            menuOrder: order,
        })
    }

    return results
}

function loadShortcutFile(name: string): SqlKeybindingConfig[] {
    const path = Object.keys(shortcutFiles).find((key) => key.endsWith(`/${name}.txt`))
    return path ? parseShortcutConfigFile(shortcutFiles[path]) : []
}

/** 默认快捷键（shortcuts-config/default.txt） */
export function loadDefaultKeybindings(): SqlKeybindingConfig[] {
    return loadShortcutFile('default')
}

export function mergeKeybindingConfigs(
    base: SqlKeybindingConfig[],
    overlay: SqlKeybindingConfig[] | undefined,
    disabledKeys: string[] | undefined,
): SqlKeybindingConfig[] {
    const byKey = new Map<string, SqlKeybindingConfig>()
    for (const item of base) {
        byKey.set(keybindingEntryKey(item), {...item})
    }

    for (const patch of overlay ?? []) {
        const normalized = {
            ...patch,
            keys: normalizeKeyChord(patch.keys),
        }
        const key = keybindingEntryKey(normalized)
        const prev = byKey.get(key)
        byKey.set(key, prev ? {...prev, ...normalized, id: normalized.id, keys: normalized.keys} : normalized)
    }

    const disabled = new Set((disabledKeys ?? []).map((k) => {
        const [id, ...rest] = k.split('|')
        return `${id}|${normalizeKeyChord(rest.join('|'))}`
    }))

    return [...byKey.values()]
        .map((item) => (disabled.has(keybindingEntryKey(item)) ? {...item, enabled: false} : item))
        .filter((item) => item.enabled !== false)
        .sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0))
}

export interface ResolvedSqlKeybinding extends SqlKeybindingConfig {
    keyCode: number
}

export function resolveKeybindings(bindings: SqlKeybindingConfig[]): ResolvedSqlKeybinding[] {
    const resolved: ResolvedSqlKeybinding[] = []
    for (const binding of bindings) {
        if (binding.enabled === false) continue
        const keyCode = parseKeyChord(binding.keys)
        if (keyCode === null) continue
        const command = resolveMonacoEditorCommand(binding.command)
        if (!isSqlEditorCommandAllowed(command)) continue
        resolved.push({...binding, command, keyCode})
    }
    return resolved
}

/** 提示条内联展示的常用快捷键（2–3 个） */
export const HINT_INLINE_SHORTCUT_IDS = [
    'format_selection',
    'delete_line',
    'toggle_comment',
] as const

/** 提示条展示的快捷键（同一 id 只保留首个绑定，避免重复） */
const HINT_SHORTCUT_ORDER = [
    'format_selection',
    'delete_line',
    'copy_line_down',
    'toggle_comment',
    'trigger_suggest',
] as const

function dedupeKeybindingsById(bindings: SqlKeybindingConfig[]): SqlKeybindingConfig[] {
    const byId = new Map<string, SqlKeybindingConfig>()
    for (const binding of bindings) {
        if (binding.enabled === false) continue
        if (!byId.has(binding.id)) byId.set(binding.id, binding)
    }
    return [...byId.values()]
}

export function listHintKeybindings(
    bindings: SqlKeybindingConfig[],
    labelOf: (labelKey: string) => string,
): HintShortcutItem[] {
    const byId = new Map(dedupeKeybindingsById(bindings).map((b) => [b.id, b]))
    const ordered = HINT_SHORTCUT_ORDER.map((id) => byId.get(id)).filter(Boolean) as SqlKeybindingConfig[]
    const orderSet = new Set<string>(HINT_SHORTCUT_ORDER)
    const rest = [...byId.values()].filter((b) => !orderSet.has(b.id))
    return [...ordered, ...rest].map((b) => ({
        id: b.id,
        keys: b.keys,
        label: labelOf(b.labelKey ?? `shortcut.${b.id}`),
    }))
}

/** 提示条摘要（紧凑单行，兼容旧 UI） */
export function summarizeKeybindingsForHint(
    bindings: SqlKeybindingConfig[],
    labelOf: (labelKey: string) => string,
): string {
    return listHintKeybindings(bindings, labelOf)
        .map((item) => `${item.keys} ${item.label}`)
        .join(' · ') || 'Tab · Ctrl+Space'
}

export function formatKeybindingsTooltip(
    bindings: SqlKeybindingConfig[],
    labelOf: (labelKey: string) => string,
): string {
    return listHintKeybindings(bindings, labelOf)
        .map((item) => `${item.keys} ${item.label}`)
        .join('\n')
}
