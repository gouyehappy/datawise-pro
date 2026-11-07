import * as monaco from 'monaco-editor'
import {SQL_EDITOR_AI_ASSIST_COMMAND} from '../builders/ai-assist-collector'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import type {SqlEditorAiAssistPayload} from '@sql-editor/types'

let registered = false

/** 补全项 command 回调（须全局 registerCommand，editor.addAction 收不到 arguments） */
export function registerSqlEditorAiAssistCommand() {
    if (registered) return
    registered = true

    monaco.editor.registerCommand(SQL_EDITOR_AI_ASSIST_COMMAND, (_accessor, ...args) => {
        const payload = args[0] as SqlEditorAiAssistPayload | undefined
        if (!payload?.action) return
        getActiveSqlEditorRuntime().invokeAiAssist?.({
            action: payload.action,
            prompt: payload.prompt ?? '',
        })
    })
}
