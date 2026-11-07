import type {ComposerTranslation} from 'vue-i18n'
import type {ContextMenuItem} from '@/core/types'

export type SqlLogMenuAction =
    | 'open-sql'
    | 'archive-personal'
    | 'archive-team'

export function buildSqlLogContextMenuItems(
    t: ComposerTranslation,
    options: {
        hasSql: boolean
        teamAvailable: boolean
        readOnlyKnowledge: boolean
    },
): ContextMenuItem[] {
    return [
        {
            id: 'open-sql',
            label: t('shortcut.sqlLogMenu.openSql'),
            icon: 'console',
            disabled: !options.hasSql,
        },
        {id: 'divider-archive', label: '', divider: true},
        {
            id: 'archive-personal',
            label: t('shortcut.sqlLogMenu.personalKnowledge'),
            icon: 'file',
            disabled: !options.hasSql || options.readOnlyKnowledge,
            disabledHint: options.readOnlyKnowledge ? t('auth.guestReadOnlyHint') : undefined,
        },
        {
            id: 'archive-team',
            label: t('shortcut.sqlLogMenu.teamLibrary'),
            icon: 'export',
            disabled: !options.hasSql || !options.teamAvailable,
            disabledHint: !options.teamAvailable ? t('shortcut.sqlLogMenu.noTeam') : undefined,
        },
    ]
}
