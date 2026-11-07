import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import type {SqlEditorMessageKey} from '@sql-editor/i18n'
import type {SqlCompletionSlot} from '@sql-editor/types'

/**
 * 槽位 i18n 标签：`slot.label.*` 与 hint bar / settings 共用。
 */
export function useCompletionSlotLabel() {
    const {t} = useSqlEditorI18n()

    function slotLabel(slot: SqlCompletionSlot): string {
        return t(`slot.label.${slot}` as SqlEditorMessageKey)
    }

    return {slotLabel}
}
