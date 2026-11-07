import {computed} from 'vue'
import {sqlEditorSettingsVersion} from '@sql-editor/config/snippets/cache'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {normalizeSqlEditorLocale, sqlEditorT, type SqlEditorMessageKey} from '@sql-editor/i18n'
import type {SqlEditorLocale} from '@sql-editor/types'

/** 编辑器 UI 文案 — 语言来自个人设置层，经 Runtime 同步 */
export function useSqlEditorI18n() {
    const locale = computed<SqlEditorLocale>(() => {
        void sqlEditorSettingsVersion.value
        return normalizeSqlEditorLocale(getActiveSqlEditorRuntime().getLocale())
    })

    function t(key: SqlEditorMessageKey | string, params?: Record<string, string | number>) {
        return sqlEditorT(locale.value, key, params)
    }

    return {locale, t}
}
