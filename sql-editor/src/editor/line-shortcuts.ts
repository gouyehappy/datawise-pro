import * as monaco from 'monaco-editor'
import {getSqlEditorShortcutsSettings} from '@sql-editor/config/snippets/cache'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {sqlEditorT} from '@sql-editor/i18n'
import {keybindingEntryKey, parseKeyChord, resolveKeybindings, resolveMonacoEditorCommand} from './shortcut-config'
import type {SqlKeybindingConfig} from '@sql-editor/types'

export interface SqlEditorLineShortcutOptions {
    readonly?: boolean
    onEdit?: () => void
    /** 覆盖运行时设置中的快捷键 */
    keybindings?: SqlKeybindingConfig[]
    /** 非 Monaco 内置命令的处理函数（返回 true 表示已执行） */
    customHandlers?: Record<string, () => boolean | void>
}

function t(labelKey: string): string {
    return sqlEditorT(
        getActiveSqlEditorRuntime().getLocale(),
        labelKey as Parameters<typeof sqlEditorT>[1],
    )
}

function runEditorCommand(
    editor: monaco.editor.IStandaloneCodeEditor,
    command: string,
): void {
    const monacoCommand = resolveMonacoEditorCommand(command)
    const action = editor.getAction(monacoCommand)
    if (action?.isSupported()) {
        void action.run()
        return
    }
    editor.trigger('sql-editor', monacoCommand, null)
}

/** 注册 SQL 编辑器快捷键（配置来自 shortcuts-config + 设置层） */
export function registerSqlEditorLineShortcuts(
    editor: monaco.editor.IStandaloneCodeEditor,
    options: SqlEditorLineShortcutOptions = {},
): monaco.IDisposable {
    const disposables: monaco.IDisposable[] = []
    const {readonly, onEdit, keybindings, customHandlers} = options

    const run = (command: string) => {
        if (readonly) return
        const custom = customHandlers?.[command]
        if (custom) {
            if (custom()) onEdit?.()
            return
        }
        runEditorCommand(editor, command)
        onEdit?.()
    }

    const source = keybindings ?? getSqlEditorShortcutsSettings().keybindings
    const resolved = resolveKeybindings(source)

    for (const binding of resolved) {
        if (parseKeyChord(binding.keys) === null) continue

        const actionId = `sql-editor.${keybindingEntryKey(binding).replace(/\|/g, '__')}`
        disposables.push(
            editor.addAction({
                id: actionId,
                label: t(binding.labelKey ?? `shortcut.${binding.id}`),
                keybindings: [binding.keyCode],
                keybindingContext: readonly ? 'false' : undefined,
                contextMenuGroupId: '9_sqlEditor',
                contextMenuOrder: binding.menuOrder ?? 0,
                run: () => run(binding.command),
            }),
        )
    }

    return {
        dispose: () => {
            for (const d of disposables) d.dispose()
        },
    }
}
