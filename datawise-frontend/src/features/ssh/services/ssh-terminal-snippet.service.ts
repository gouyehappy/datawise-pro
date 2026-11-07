import type {SshScriptRecord} from '@/features/ssh/types/ssh-script-record.types'
import {
    createEmptySshScriptRecord,
    createSshCommandItem,
} from '@/features/ssh/types/ssh-script-record.types'
import {
    listSshScriptRecords,
    saveSshScriptRecord,
} from '@/features/ssh/services/ssh-script-records.service'
import {
    resolveRecordCommands,
    serializeCommandEntries,
} from '@/features/ssh/services/ssh-my-commands.service'
import {
    toPlainCommandText,
    toStoredCommandText,
} from '@/features/ssh/services/ssh-script-record-content.service'
import {t} from '@/i18n'

/** 终端选区保存为纯文本命令记录。 */
export function terminalOutputToRecordText(text: string): string {
    return toStoredCommandText(text.trimEnd() + '\n')
}

export function appendTerminalOutputToRecordText(existingStored: string, text: string): string {
    const block = text.trim()
    if (!block) return toStoredCommandText(existingStored)
    const base = toPlainCommandText(existingStored).replace(/\s+$/, '')
    if (!base) return terminalOutputToRecordText(block)
    return toStoredCommandText(`${base}\n\n# ${t('ssh.records.snippetComment')}\n${block}\n`)
}

/** @deprecated Use {@link terminalOutputToRecordText} */
export function terminalOutputToRecordHtml(text: string): string {
    return terminalOutputToRecordText(text)
}

/** @deprecated Use {@link appendTerminalOutputToRecordText} */
export function appendTerminalOutputToRecordHtml(existingHtml: string, text: string): string {
    return appendTerminalOutputToRecordText(existingHtml, text)
}

export function defaultTerminalSnippetTitle(now = new Date()): string {
    const stamp = now.toLocaleString(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
    return `Terminal ${stamp}`
}

export async function createScriptRecordFromTerminalSelection(
    connectionId: string,
    selection: string,
    title: string,
): Promise<SshScriptRecord> {
    const trimmed = selection.trim()
    if (!trimmed) {
        throw new Error('EMPTY_SELECTION')
    }
    const commands = [
        createSshCommandItem({
            title: '',
            command: trimmed,
            mode: 'paste',
        }),
    ]
    const record = createEmptySshScriptRecord(`record-${Date.now()}`, title.trim())
    record.commands = commands
    record.contentHtml = serializeCommandEntries(commands)
    return saveSshScriptRecord(connectionId, record)
}

export async function appendTerminalSelectionToScriptRecord(
    connectionId: string,
    recordId: string,
    selection: string,
): Promise<SshScriptRecord> {
    const trimmed = selection.trim()
    if (!trimmed) {
        throw new Error('EMPTY_SELECTION')
    }
    const records = await listSshScriptRecords(connectionId)
    const existing = records.find((item) => item.id === recordId)
    if (!existing) {
        throw new Error('RECORD_NOT_FOUND')
    }
    const commands = [
        ...resolveRecordCommands(existing),
        createSshCommandItem({
            title: t('ssh.records.snippetTitle'),
            command: trimmed,
            mode: 'paste',
        }),
    ]
    return saveSshScriptRecord(connectionId, {
        ...existing,
        commands,
        contentHtml: serializeCommandEntries(commands),
        updatedAt: Date.now(),
    })
}
