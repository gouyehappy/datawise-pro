import * as monaco from 'monaco-editor'
import type {SqlTablePeekPayload} from '@sql-editor/utils/sql-table-peek'

export const SQL_TABLE_PEEK_LINK_CLASS = 'sql-editor-table-peek-link'

export type SqlTablePeekOptions = {
    resolve: (sql: string, offset: number) => SqlTablePeekPayload | null
    onOpen: (payload: SqlTablePeekPayload) => void
    tooltip: () => string
    isEnabled?: () => boolean
    isReadonly?: () => boolean
}

function isPeekModifier(event: {ctrlKey: boolean; metaKey: boolean; altKey?: boolean; shiftKey?: boolean}): boolean {
    if (event.altKey || event.shiftKey) return false
    return event.ctrlKey || event.metaKey
}

function rangeFromHit(model: monaco.editor.ITextModel, hit: SqlTablePeekPayload): monaco.Range {
    const start = model.getPositionAt(hit.startOffset)
    const end = model.getPositionAt(hit.endOffset)
    return monaco.Range.fromPositions(start, end)
}

/** Ctrl/Cmd + click a table (or alias) in the SQL editor to open it. */
export function bindSqlTablePeek(
    editor: monaco.editor.IStandaloneCodeEditor,
    options: SqlTablePeekOptions,
): monaco.IDisposable {
    let decorations: string[] = []

    function clearDecorations() {
        if (!decorations.length) return
        decorations = editor.deltaDecorations(decorations, [])
    }

    function hitAt(position: monaco.Position | null | undefined): SqlTablePeekPayload | null {
        if (!options.isEnabled || !options.isEnabled()) return null
        if (options.isReadonly?.()) return null
        const model = editor.getModel()
        if (!model || !position) return null
        const offset = model.getOffsetAt(position)
        return options.resolve(model.getValue(), offset)
    }

    function showHit(hit: SqlTablePeekPayload) {
        const model = editor.getModel()
        if (!model) return
        const tooltip = options.tooltip().trim()
        decorations = editor.deltaDecorations(decorations, [
            {
                range: rangeFromHit(model, hit),
                options: {
                    inlineClassName: SQL_TABLE_PEEK_LINK_CLASS,
                    hoverMessage: tooltip ? {value: tooltip} : undefined,
                },
            },
        ])
    }

    const mouseMove = editor.onMouseMove((event) => {
        if (!isPeekModifier(event.event)) {
            clearDecorations()
            return
        }
        const hit = hitAt(event.target.position)
        if (!hit) {
            clearDecorations()
            return
        }
        showHit(hit)
    })

    const mouseLeave = editor.onMouseLeave(() => clearDecorations())

    const mouseDown = editor.onMouseDown((event) => {
        if (!event.event.leftButton) return
        if (!isPeekModifier(event.event)) return
        const hit = hitAt(event.target.position)
        if (!hit) return
        event.event.preventDefault()
        event.event.stopPropagation()
        options.onOpen(hit)
    })

    const keyUp = editor.onKeyUp((event) => {
        if (event.keyCode === monaco.KeyCode.Ctrl || event.keyCode === monaco.KeyCode.Meta) {
            clearDecorations()
        }
    })

    const onWindowBlur = () => clearDecorations()
    window.addEventListener('blur', onWindowBlur)

    return {
        dispose() {
            mouseMove.dispose()
            mouseLeave.dispose()
            mouseDown.dispose()
            keyUp.dispose()
            window.removeEventListener('blur', onWindowBlur)
            clearDecorations()
        },
    }
}
