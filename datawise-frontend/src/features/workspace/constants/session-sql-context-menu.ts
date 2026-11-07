import type {ComposerTranslation} from 'vue-i18n'
import type {ContextMenuItem} from '@/core/types'

export type SessionSqlMenuAction = 'open-sql' | 'view-plan'

export function buildSessionSqlContextMenuItems(
    t: ComposerTranslation,
    options: {
        hasSql: boolean
        explainSupported: boolean
        explainDisabledHint?: string
    },
): ContextMenuItem[] {
    const disabledOpen = !options.hasSql
    const disabledPlan = !options.hasSql || !options.explainSupported

    return [
        {
            id: 'open-sql',
            label: t('shortcut.sessionSql.openSql'),
            icon: 'console',
            disabled: disabledOpen,
        },
        {
            id: 'view-plan',
            label: t('shortcut.sessionSql.viewPlan'),
            icon: 'explain',
            disabled: disabledPlan,
            disabledHint: !options.explainSupported ? options.explainDisabledHint : undefined,
        },
    ]
}
