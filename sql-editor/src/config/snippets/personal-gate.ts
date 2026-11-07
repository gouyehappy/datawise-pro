import {normalizeSqlEditorShortcutsLayer} from '@sql-editor/config/snippets/normalize'
import {sqlEditorShortcutsLayerHasOverrides} from '@sql-editor/config/snippets/layer-overrides'
import type {SqlEditorShortcutsLayer} from '@sql-editor/types'

/**
 * 「个人片段」插件只应关掉 snippets，不能丢掉 personal 里的行为开关
 *（showHintBar / autoTableAlias / formatter 等），否则设置抽屉拨了会被 sync 盖回默认。
 */
export function resolvePersonalLayerForSnippetGate(
    layer: SqlEditorShortcutsLayer | null | undefined,
    snippetsEnabled: boolean,
): SqlEditorShortcutsLayer | null {
    const normalized = normalizeSqlEditorShortcutsLayer(layer)
    if (!sqlEditorShortcutsLayerHasOverrides(normalized)) return null
    if (snippetsEnabled) return normalized

    const {snippets: _snippets, ...behaviorOnly} = normalized
    return sqlEditorShortcutsLayerHasOverrides(behaviorOnly) ? behaviorOnly : null
}
