import * as monaco from 'monaco-editor'
import {isCompletionAcceptChange} from './suggest-accept-utils'

export {isCompletionAcceptChange} from './suggest-accept-utils'

export function bindSuggestAcceptSuppress(
    editor: monaco.editor.IStandaloneCodeEditor,
    onAccept: () => void,
): monaco.IDisposable {
    return editor.onDidChangeModelContent((event) => {
        if (event.isFlush || event.isUndoing) return
        if (!event.changes.some(isCompletionAcceptChange)) return
        onAccept()
    })
}
