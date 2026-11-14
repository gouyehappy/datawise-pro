import {normalizeSqlEditorShortcutsLayer} from '@sql-editor/config/snippets/normalize'
import type {SqlEditorShortcutsLayer} from '@sql-editor/types'

/** 层是否包含任意用户/共享覆盖（非空层判定 — 单一事实来源） */
export function sqlEditorShortcutsLayerHasOverrides(
    layer: SqlEditorShortcutsLayer | null | undefined,
): boolean {
    const normalized = normalizeSqlEditorShortcutsLayer(layer)
    return !!(
        normalized.autoTableAlias !== undefined
        || normalized.showHintQuickChips !== undefined
        || normalized.showHintBar !== undefined
        || normalized.showSuggestDetails !== undefined
        || normalized.showColumnCommentInSuggest !== undefined
        || normalized.folding !== undefined
        || normalized.showRunGutterButton !== undefined
        || normalized.columnDiagnosticsMode !== undefined
        || normalized.vimModeEnabled !== undefined
        || normalized.locale !== undefined
        || normalized.fontSize !== undefined
        || normalized.theme !== undefined
        || normalized.formatter !== undefined
        || (normalized.disabledQuickChipIds?.length ?? 0) > 0
        || (normalized.quickChips?.length ?? 0) > 0
        || (normalized.snippets?.length ?? 0) > 0
        || (normalized.keybindings?.length ?? 0) > 0
        || (normalized.disabledKeybindingKeys?.length ?? 0) > 0
        || normalized.ai !== undefined
    )
}
