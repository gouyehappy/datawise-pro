import {askAppConfirm} from '@/core/services/app-confirm.service'
import {t} from '@/i18n'

/** Whether draft differs from the last loaded/saved baseline while editing. */
export function isConfigContentDirty(
    editing: boolean,
    baseline: string | null | undefined,
    draft: string,
): boolean {
    if (!editing) return false
    return draft !== (baseline ?? '')
}

/**
 * Confirm discarding unsaved edits. Returns true when navigation/edit exit may proceed.
 * @param confirmFn injectable for tests (defaults to app ConfirmDialog via askAppConfirm)
 */
export async function confirmDiscardConfigEdits(
    dirty: boolean,
    message: string,
    confirmFn?: (msg: string) => boolean | Promise<boolean>,
): Promise<boolean> {
    if (!dirty) return true
    if (confirmFn) {
        return confirmFn(message)
    }
    return askAppConfirm({
        title: t('common.confirm'),
        message,
        confirmVariant: 'danger',
    })
}
