import type {ComposerTranslation} from 'vue-i18n'
import type {ContextMenuItem} from '@/core/types'
import type {SshScriptRecord} from '@/features/ssh/types/ssh-script-record.types'

export interface SshTerminalContextMenuOptions {
    hasSelection: boolean
    records: SshScriptRecord[]
    yarnAppId?: string | null
    hasYarnConnection?: boolean
}

export function buildSshTerminalContextMenu(
    t: ComposerTranslation,
    options: SshTerminalContextMenuOptions,
): ContextMenuItem[] {
    const appendChildren: ContextMenuItem[] = options.records.map((record) => ({
        id: `append-record:${record.id}`,
        label: record.title || t('ssh.scriptRecord.untitled'),
    }))

    const items: ContextMenuItem[] = [
        {
            id: 'copy-selection',
            label: t('terminal.sshCopySelection'),
            icon: 'copy',
            disabled: !options.hasSelection,
        },
        {
            id: 'paste',
            label: t('terminal.sshPaste'),
            icon: 'import',
        },
    ]

    if (options.yarnAppId) {
        items.push(
            {id: 'divider-yarn', label: '', divider: true},
            {
                id: 'open-yarn-app',
                label: t('ssh.yarnBridge.openInYarn'),
                icon: 'run',
                disabled: !options.hasYarnConnection,
                disabledHint: t('ssh.yarnBridge.noYarnConnection'),
            },
            {
                id: 'paste-yarn-logs',
                label: t('ssh.yarnBridge.pasteYarnLogs'),
                icon: 'console',
            },
        )
    }

    items.push(
        {id: 'divider-1', label: '', divider: true},
        {
            id: 'save-new-record',
            label: t('terminal.sshSaveSelectionNew'),
            icon: 'edit',
            shortcut: 'Ctrl+S',
            disabled: !options.hasSelection,
        },
    )

    if (appendChildren.length > 0) {
        items.push({
            id: 'append-record-submenu',
            label: t('terminal.sshSaveSelectionAppend'),
            icon: 'edit',
            disabled: !options.hasSelection,
            children: appendChildren,
        })
    } else {
        items.push({
            id: 'append-record-empty',
            label: t('terminal.sshSaveSelectionAppend'),
            icon: 'edit',
            disabled: true,
            disabledHint: t('terminal.sshSaveSelectionAppendEmpty'),
        })
    }

    items.push(
        {id: 'divider-2', label: '', divider: true},
        {id: 'clear', label: t('terminal.clear'), icon: 'delete'},
    )

    return items
}
