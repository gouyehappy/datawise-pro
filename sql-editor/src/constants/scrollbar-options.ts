import type * as monaco from 'monaco-editor'

/** 与 frontend `--dw-scrollbar-size` / DwOverlayScroll 轨宽一致（4px） */
export const SQL_EDITOR_SCROLLBAR_SIZE = 4

/** Monaco 编辑器滚动条：细窄、无箭头、无阴影，宽度与资源树叠加条相同 */
export const SQL_EDITOR_SCROLLBAR_OPTIONS: monaco.editor.IEditorScrollbarOptions = {
    vertical: 'auto',
    horizontal: 'auto',
    verticalScrollbarSize: SQL_EDITOR_SCROLLBAR_SIZE,
    horizontalScrollbarSize: SQL_EDITOR_SCROLLBAR_SIZE,
    verticalSliderSize: SQL_EDITOR_SCROLLBAR_SIZE,
    horizontalSliderSize: SQL_EDITOR_SCROLLBAR_SIZE,
    useShadows: false,
    verticalHasArrows: false,
    horizontalHasArrows: false,
    arrowSize: 0,
    scrollByPage: false,
}
