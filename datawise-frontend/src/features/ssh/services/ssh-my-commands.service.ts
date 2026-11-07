import {
    looksLikeStoredHtml,
    toPlainCommandText,
} from '@/features/ssh/services/ssh-script-record-content.service'
import {
    createSshCommandItem,
    type SshCommandItem,
    type SshCommandMode,
    type SshScriptRecord,
} from '@/features/ssh/types/ssh-script-record.types'

export type MyCommandMode = SshCommandMode

export interface MyCommandEntry {
    label: string
    command: string
    mode?: MyCommandMode
    description?: string
}

export interface MyCommandGroup {
    id: string
    title: string
    entries: MyCommandEntry[]
    multi: boolean
    mode: MyCommandMode
    builtIn: boolean
    pinned: boolean
}

/**
 * Keep in sync with backend {@code SshCommandDslParser}:
 * - `@run` / `@paste` sectional mode
 * - `## ...` ignored comment
 * - `# title [:: description] [!run|!paste]` optional meta
 * - other lines = command body
 */
const LABEL_LINE = /^#(?!#)\s*(.*?)(?:\s*::\s*(.*?))?(?:\s+!(run|paste))?\s*$/i
const MODE_LINE = /^@(run|paste)\s*$/i
export const SSH_BUILTIN_RECORD_PREFIX = 'builtin-'

export function isBuiltInScriptRecordId(recordId: string): boolean {
    return recordId.startsWith(SSH_BUILTIN_RECORD_PREFIX)
}

export function splitCommandLines(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
}

function resolveEntryMode(
    entryMode: MyCommandMode | undefined,
    groupMode: MyCommandMode,
): MyCommandMode {
    return entryMode ?? groupMode
}

function normalizeMode(value: string | undefined | null, fallback: MyCommandMode = 'paste'): MyCommandMode {
    const normalized = value?.trim().toLowerCase()
    return normalized === 'run' || normalized === 'paste' ? normalized : fallback
}

/** Sectional `@run`/`@paste` apply to following commands until the next mode line. */
export function parseCommandEntries(text: string, defaultMode: MyCommandMode = 'paste'): {
    mode: MyCommandMode
    entries: MyCommandEntry[]
    commands: SshCommandItem[]
} {
    let currentMode = defaultMode
    const commands: SshCommandItem[] = []
    let pendingLabel: string | null = null
    let pendingDescription: string | null = null
    let pendingEntryMode: MyCommandMode | undefined

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim()
        if (!line) continue
        if (line.startsWith('##')) continue

        const modeMatch = line.match(MODE_LINE)
        if (modeMatch) {
            currentMode = normalizeMode(modeMatch[1], currentMode)
            continue
        }

        const labelMatch = line.match(LABEL_LINE)
        if (labelMatch) {
            const title = (labelMatch[1] ?? '').trim()
            const description = (labelMatch[2] ?? '').trim()
            pendingEntryMode = labelMatch[3] ? normalizeMode(labelMatch[3]) : undefined
            if (!title && !description && !pendingEntryMode) {
                pendingLabel = null
                pendingDescription = null
                continue
            }
            pendingLabel = title
            pendingDescription = description
            continue
        }

        const mode = pendingEntryMode ?? currentMode
        commands.push(createSshCommandItem({
            title: pendingLabel ?? '',
            command: line,
            mode,
            description: pendingDescription ?? '',
        }))
        pendingLabel = null
        pendingDescription = null
        pendingEntryMode = undefined
    }

    const entries = commands.map(commandItemToEntry)
    return {
        mode: commands[0]?.mode ?? defaultMode,
        entries,
        commands,
    }
}

function formatLabelLine(title: string, description: string): string {
    if (!title && !description) return ''
    if (!description) return `# ${title}`
    if (!title) return `# :: ${description}`
    return `# ${title} :: ${description}`
}

/** Serialize structured commands back to editor DSL (sectional mode lines). */
export function serializeCommandEntries(commands: SshCommandItem[]): string {
    if (!commands.length) return ''
    const lines: string[] = []
    let lastMode: MyCommandMode | null = null
    for (const item of commands) {
        const command = item.command?.trim()
        if (!command) continue
        const mode = normalizeMode(item.mode)
        if (mode !== lastMode) {
            if (lines.length) lines.push('')
            lines.push(`@${mode}`)
            lastMode = mode
        } else if (lines.length) {
            lines.push('')
        }
        const title = item.title?.trim() ?? ''
        const description = item.description?.trim() ?? ''
        const label = formatLabelLine(title, description)
        if (label) lines.push(label)
        lines.push(command)
    }
    return lines.length ? `${lines.join('\n')}\n` : ''
}

/** Executable payload for terminal — command lines only, no `@` / `#` meta. */
export function commandsToExecutableText(commands: SshCommandItem[]): string {
    const lines = commands
        .map((item) => item.command?.trim() ?? '')
        .filter(Boolean)
    return lines.length ? `${lines.join('\n')}\n` : ''
}

export function commandItemToEntry(item: SshCommandItem): MyCommandEntry {
    const title = item.title?.trim() ?? ''
    return {
        label: title || summarizeCommandLabel(item.command),
        command: item.command,
        mode: normalizeMode(item.mode),
        description: item.description ?? '',
    }
}

export function hasStructuredCommands(record: Pick<SshScriptRecord, 'commands'>): boolean {
    return Array.isArray(record.commands)
        && record.commands.some((item) => !!item?.command?.trim())
}

function commandsLookPoisonedByHtml(commands: SshCommandItem[]): boolean {
    return commands.some((item) => /<\/?[a-z!/?]/i.test(item.command ?? ''))
}

/** Resolve structured commands from a record, migrating legacy DSL text when needed. */
export function resolveRecordCommands(record: SshScriptRecord): SshCommandItem[] {
    const stored = record.contentHtml ?? ''
    if (hasStructuredCommands(record)) {
        const structured = (record.commands ?? []).map((item) => createSshCommandItem({
            title: item.title,
            command: item.command,
            mode: item.mode,
            description: item.description,
        }))
        // Salvage: older migrate may have parsed raw HTML into command strings.
        if (looksLikeStoredHtml(stored) && commandsLookPoisonedByHtml(structured)) {
            return parseCommandEntries(toPlainCommandText(stored)).commands
        }
        return structured
    }
    return parseCommandEntries(toPlainCommandText(stored)).commands
}

export function hydrateSshScriptRecord(record: SshScriptRecord): SshScriptRecord {
    const commands = resolveRecordCommands(record)
    const contentHtml = record.contentHtml?.trim()
        ? record.contentHtml
        : serializeCommandEntries(commands)
    return {
        ...record,
        commands,
        contentHtml,
    }
}

export function parseMyCommandGroups(
    records: SshScriptRecord[],
    untitledLabel: string,
    pinnedIds: string[] = [],
): MyCommandGroup[] {
    const pinnedSet = new Set(pinnedIds)
    const groups: MyCommandGroup[] = []
    for (const record of records) {
        const commands = resolveRecordCommands(record)
        if (!commands.length) continue
        const entries = commands.map(commandItemToEntry)
        groups.push({
            id: record.id,
            title: record.title?.trim() || untitledLabel,
            entries,
            multi: entries.length > 1,
            mode: entries[0]?.mode ?? 'paste',
            builtIn: isBuiltInScriptRecordId(record.id),
            pinned: pinnedSet.has(record.id),
        })
    }
    return sortMyCommandGroups(groups)
}

export function sortMyCommandGroups(groups: MyCommandGroup[]): MyCommandGroup[] {
    return [...groups].sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
        if (left.builtIn !== right.builtIn) return left.builtIn ? -1 : 1
        return left.title.localeCompare(right.title, undefined, {sensitivity: 'base'})
    })
}

export function filterMyCommandGroups(groups: MyCommandGroup[], query: string): MyCommandGroup[] {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return groups

    return groups.flatMap((group) => {
        if (group.title.toLowerCase().includes(normalized)) return [group]

        const matchedEntries = group.entries.filter((entry) =>
            entry.label.toLowerCase().includes(normalized)
            || entry.command.toLowerCase().includes(normalized)
            || (entry.description ?? '').toLowerCase().includes(normalized),
        )
        if (!matchedEntries.length) return []

        return [{
            ...group,
            entries: matchedEntries,
            multi: matchedEntries.length > 1,
        }]
    })
}

export function summarizeCommandLabel(command: string, maxLength = 48): string {
    const compact = command.replace(/\s+/g, ' ').trim()
    if (compact.length <= maxLength) return compact
    return `${compact.slice(0, maxLength - 1)}…`
}

export function resolveEntryAction(entry: MyCommandEntry, group: MyCommandGroup): MyCommandMode {
    return resolveEntryMode(entry.mode, group.mode)
}
