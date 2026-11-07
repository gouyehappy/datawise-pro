import * as vscode from 'vscode'
import {openInDataWise} from './open-in-datawise'

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('datawise.openInDataWise', () => openInDataWise()),
    )
}

export function deactivate(): void {}
