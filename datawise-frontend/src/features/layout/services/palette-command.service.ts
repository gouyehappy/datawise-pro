import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import type {ShortcutActionId, ShortcutDefinition} from '@/core/shortcuts/types'
import {canExecuteShortcutAction} from '@/features/auth/services/feature-permission.service'
import {toPinyinInitials} from '@/features/layout/services/pinyin-match.service'

/** Palette 可执行的命令（复用快捷键动作，排除自身以免循环） */
const PALETTE_COMMAND_IDS = new Set<ShortcutActionId>([
    'workspace.newConsole',
    'workspace.runSql',
    'workspace.saveConsole',
    'workspace.aiPrompt',
    'explorer.refresh',
    'explorer.locate',
    'app.toggleTerminal',
    'app.toggleNotifications',
    'app.toggleAssistant',
    'app.openSettings',
    'app.lockScreen',
    'app.shortcutCheatsheet',
])

export interface PaletteCommandEntry {
    id: ShortcutActionId
    labelKey: string
}

export type ScoredPaletteCommand = PaletteCommandEntry & {score: number}

const PALETTE_COMMANDS: PaletteCommandEntry[] = SHORTCUT_DEFINITIONS.filter((def) =>
    PALETTE_COMMAND_IDS.has(def.id),
).map((def) => ({id: def.id, labelKey: def.labelKey}))

function accessiblePaletteCommands(): PaletteCommandEntry[] {
    return PALETTE_COMMANDS.filter((def) => canExecuteShortcutAction(def.id))
}

export function listPaletteCommands(): PaletteCommandEntry[] {
    return accessiblePaletteCommands()
}

export function isPaletteCommandMode(query: string): boolean {
    return query.trimStart().startsWith('>')
}

export function paletteCommandQuery(query: string): string {
    return query.trimStart().slice(1).trim()
}

function scoreCommand(def: PaletteCommandEntry, query: string, labelOf: (key: string) => string): number {
    const needle = query.trim().toLowerCase()
    if (!needle) return 1
    const label = labelOf(def.labelKey).toLowerCase()
    const id = def.id.toLowerCase()
    const initials = toPinyinInitials(labelOf(def.labelKey))
    if (label === needle || id === needle) return 100
    if (label.startsWith(needle) || id.startsWith(needle)) return 80
    if (initials && initials.startsWith(needle) && needle.length >= 2) return 70
    if (label.includes(needle) || id.includes(needle)) return 50
    if (initials && initials.includes(needle) && needle.length >= 2) return 40
    return -1
}

/** 带分的命令搜索；非 `>` 模式也可用，便于与对象结果交错排序 */
export function searchPaletteCommandsScored(
    query: string,
    labelOf: (key: string) => string,
): ScoredPaletteCommand[] {
    const effective = isPaletteCommandMode(query) ? paletteCommandQuery(query) : query.trim()
    return accessiblePaletteCommands()
        .map((def) => ({...def, score: scoreCommand(def, effective, labelOf)}))
        .filter((item) => item.score >= 0)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

export function searchPaletteCommands(
    query: string,
    labelOf: (key: string) => string,
): PaletteCommandEntry[] {
    return searchPaletteCommandsScored(query, labelOf).map(({score: _s, ...rest}) => rest)
}

export function shortcutDefinitionFor(id: ShortcutActionId): ShortcutDefinition | undefined {
    return SHORTCUT_DEFINITIONS.find((def) => def.id === id)
}
