import {getSqlEditorShowRunGutterButton, sqlEditorSettingsVersion} from '@sql-editor/config/snippets/cache'

/** 行内执行按钮：合并设置显式 false 才关，缺省为开 */
export function isSqlRunGutterEnabled(): boolean {
    void sqlEditorSettingsVersion.value
    return getSqlEditorShowRunGutterButton()
}
