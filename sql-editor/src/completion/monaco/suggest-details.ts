import * as monaco from 'monaco-editor'
import {computeSuggestDetailsTranslateY} from './suggest-details-offset'

const SUGGEST_CONTROLLER_ID = 'editor.contrib.suggestController'

/** 箭头相对二级面板顶部的固定锚点（面板整体跟随行移动） */
const DETAILS_ARROW_TOP_PX = 22

interface SuggestWidgetLike {
    onDidShow: monaco.IEvent<unknown>
    onDidFocus: monaco.IEvent<unknown>
}

interface SuggestControllerLike {
    widget: { value: SuggestWidgetLike | undefined }
    toggleSuggestionDetails: () => void
}

export interface SqlSuggestDetailsBindOptions {
    isEnabled: () => boolean
}

function getSuggestController(editor: monaco.editor.IStandaloneCodeEditor): SuggestControllerLike | null {
    return editor.getContribution(SUGGEST_CONTROLLER_ID) as SuggestControllerLike | null
}

type EditorWithOverflowHost = monaco.editor.IStandaloneCodeEditor & {
    getOverflowWidgetsDomNode?: () => HTMLElement | undefined
}

/** Prefer overflowWidgetsDomNode (body host); fall back to editor DOM. */
function querySuggestRoots(editor: monaco.editor.IStandaloneCodeEditor): ParentNode[] {
    const roots: ParentNode[] = []
    const overflow = (editor as EditorWithOverflowHost).getOverflowWidgetsDomNode?.()
    if (overflow) roots.push(overflow)
    const dom = editor.getDomNode()
    if (dom && dom !== overflow) roots.push(dom)
    return roots
}

function querySuggestInRoots(roots: ParentNode[], selector: string): Element | null {
    for (const root of roots) {
        const hit = root.querySelector(selector)
        if (hit) return hit
    }
    return null
}

function isSuggestDetailsVisible(editor: monaco.editor.IStandaloneCodeEditor): boolean {
    return Boolean(querySuggestInRoots(querySuggestRoots(editor), '.suggest-widget.shows-details'))
}

function setSuggestDetailsVisible(editor: monaco.editor.IStandaloneCodeEditor, visible: boolean) {
    if (!editor.getDomNode()?.ownerDocument) return
    const currentlyVisible = isSuggestDetailsVisible(editor)
    if (currentlyVisible === visible) return
    getSuggestController(editor)?.toggleSuggestionDetails()
}

function querySuggestDetailsAlignNodes(editor: monaco.editor.IStandaloneCodeEditor) {
    const roots = querySuggestRoots(editor)
    if (!roots.length) return null
    const details = querySuggestInRoots(roots, '.suggest-details-container') as HTMLElement | null
    const focusedRow = querySuggestInRoots(
        roots,
        '.suggest-widget .monaco-list-row.focused',
    ) as HTMLElement | null
    const widget = querySuggestInRoots(roots, '.suggest-widget') as HTMLElement | null
    if (!details || !focusedRow) return null
    return {details, focusedRow, widget}
}

function resetDetailsOffset(details: HTMLElement) {
    details.style.setProperty('--dw-suggest-details-ty', '0px')
}

/**
 * 二级面板整体随当前选中行上下移动，箭头固定指在面板上部对准该行。
 * （Monaco 默认把 details 钉在 suggest-widget 顶对齐，只移箭头会「指空」。）
 */
export function alignSuggestDetailsArrow(editor: monaco.editor.IStandaloneCodeEditor) {
    const nodes = querySuggestDetailsAlignNodes(editor)
    if (!nodes) return

    const {details, focusedRow, widget} = nodes

    // 先清偏移再量自然位置，避免累计 translate
    resetDetailsOffset(details)
    void details.offsetHeight

    const detailsRect = details.getBoundingClientRect()
    const rowRect = focusedRow.getBoundingClientRect()
    if (detailsRect.height < 4 || rowRect.height < 4) return

    const arrowTop = Math.min(DETAILS_ARROW_TOP_PX, Math.max(14, detailsRect.height / 2))
    const margin = 8
    const viewTop = margin
    const viewBottom =
        (typeof window !== 'undefined' ? window.innerHeight : detailsRect.bottom + detailsRect.height) -
        margin
    const listTop = widget?.getBoundingClientRect().top
    const clampTop = listTop !== undefined ? Math.max(viewTop, listTop - 4) : viewTop
    const ty = computeSuggestDetailsTranslateY({
        detailsTop: detailsRect.top,
        detailsHeight: detailsRect.height,
        rowTop: rowRect.top,
        rowHeight: rowRect.height,
        arrowTop,
        clampTop,
        clampBottom: viewBottom,
    })

    details.style.setProperty('--dw-suggest-details-ty', `${Math.round(ty)}px`)
    details.style.setProperty('--dw-suggest-arrow-top', `${Math.round(arrowTop)}px`)
}

/** 详情面板布局/异步 markdown 渲染后再对齐 */
export function scheduleAlignSuggestDetailsArrow(editor: monaco.editor.IStandaloneCodeEditor) {
    const run = () => alignSuggestDetailsArrow(editor)
    requestAnimationFrame(() => requestAnimationFrame(run))
    window.setTimeout(run, 48)
    window.setTimeout(run, 160)
}

function focusedSuggestRowCanExpandDocs(editor: monaco.editor.IStandaloneCodeEditor): boolean {
    const roots = querySuggestRoots(editor)
    const row = querySuggestInRoots(roots, '.suggest-widget .monaco-list-row.focused')
    // 仅 documentation（片段 / 字段注释 / 函数 / FK）可展开；纯 detail（如 Table · alias）不展开
    return Boolean(row?.querySelector('.right.can-expand-details'))
}

function syncSuggestDetailsPanel(
    editor: monaco.editor.IStandaloneCodeEditor,
    isEnabled: () => boolean,
) {
    if (!isEnabled()) {
        setSuggestDetailsVisible(editor, false)
        return
    }
    const canExpand = focusedSuggestRowCanExpandDocs(editor)
    if (!canExpand) {
        // 表名等无 docs 项：立刻收起，避免左侧「Table · alias」空详情一闪
        setSuggestDetailsVisible(editor, false)
        const roots = querySuggestRoots(editor)
        const details = querySuggestInRoots(roots, '.suggest-details-container') as HTMLElement | null
        if (details) resetDetailsOffset(details)
        return
    }
    setSuggestDetailsVisible(editor, true)
    scheduleAlignSuggestDetailsArrow(editor)
}

export function applySqlSuggestDetailsSetting(
    editor: monaco.editor.IStandaloneCodeEditor,
    enabled: boolean,
) {
    setSuggestDetailsVisible(editor, enabled)
}

/**
 * Monaco 补全详情面板默认折叠（expandSuggestionDocs=false）。
 * 绑定后：在配置开启时，补全列表打开或切换选中项时自动展开右侧二级面板。
 */
export function bindSqlSuggestDetailsAutoShow(
    editor: monaco.editor.IStandaloneCodeEditor,
    options: SqlSuggestDetailsBindOptions,
): monaco.IDisposable {
    const disposables: monaco.IDisposable[] = []
    let widgetBound = false

    let syncTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleSync = () => {
        if (syncTimer) clearTimeout(syncTimer)
        syncTimer = setTimeout(() => {
            syncTimer = null
            syncSuggestDetailsPanel(editor, options.isEnabled)
        }, 0)
    }

    const bindWidget = (): boolean => {
        if (widgetBound) return true
        const widget = getSuggestController(editor)?.widget?.value
        if (!widget) return false
        widgetBound = true
        disposables.push(widget.onDidShow(scheduleSync))
        disposables.push(widget.onDidFocus(scheduleSync))
        return true
    }

    disposables.push(
        editor.onDidFocusEditorText(() => {
            bindWidget()
        }),
    )

    if (!bindWidget()) {
        const retryId = window.setInterval(() => {
            if (bindWidget()) window.clearInterval(retryId)
        }, 100)
        disposables.push({dispose: () => window.clearInterval(retryId)})
    }

    return {
        dispose: () => {
            if (syncTimer) clearTimeout(syncTimer)
            for (const d of disposables) d.dispose()
        },
    }
}
