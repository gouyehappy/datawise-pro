import * as vscode from 'vscode'
import {buildDeepLinkUrl, resolveSqlFromEditorText} from './deep-link'

function readOptionalSetting(config: vscode.WorkspaceConfiguration, key: 'connectionId' | 'database'): string | undefined {
    const value = config.get<string>(key)?.trim()
    return value || undefined
}

export async function openInDataWise(editor?: vscode.TextEditor): Promise<void> {
    const activeEditor = editor ?? vscode.window.activeTextEditor
    if (!activeEditor) {
        void vscode.window.showWarningMessage('DataWise: no active editor.')
        return
    }

    const document = activeEditor.document
    const selection = activeEditor.selection
    const sql = resolveSqlFromEditorText(
        document.getText(),
        document.getText(selection),
        !selection.isEmpty,
    )

    if (!sql) {
        void vscode.window.showWarningMessage('DataWise: select SQL text or open a file with SQL content.')
        return
    }

    const config = vscode.workspace.getConfiguration('datawise')
    const connectionId = readOptionalSetting(config, 'connectionId')
    const database = readOptionalSetting(config, 'database')

    const url = buildDeepLinkUrl({connectionId, database, sql})
    const opened = await vscode.env.openExternal(vscode.Uri.parse(url))
    if (!opened) {
        void vscode.window.showErrorMessage(
            'DataWise: could not open the desktop app. Install DataWise CLI and ensure the datawise:// protocol is registered.',
        )
    }
}
