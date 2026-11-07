import * as monaco from 'monaco-editor'
import {
    SUGGEST_WIDTH_MIN,
    clampSuggestWidgetWidth,
    estimateSuggestRowWidthPx,
} from './suggest-width-math'

export {
    SUGGEST_WIDTH_MIN,
    SUGGEST_WIDTH_MAX,
    SUGGEST_WIDTH_VIEWPORT_RATIO,
    estimateSuggestRowWidthPx,
    clampSuggestWidgetWidth,
} from './suggest-width-math'

const SUGGEST_CONTROLLER_ID = 'editor.contrib.suggestController'

type EditorWithOverflowHost = monaco.editor.IStandaloneCodeEditor & {
    getOverflowWidgetsDomNode?: () => HTMLElement | undefined
}

interface SuggestWidgetLike {
    onDidShow: monaco.IEvent<unknown>
    onDidFocus: monaco.IEvent<unknown>
    onDidHide: monaco.IEvent<unknown>
}

interface SuggestControllerLike {
    widget: {value: SuggestWidgetLike | undefined}
}

function getSuggestController(editor: monaco.editor.IStandaloneCodeEditor): SuggestControllerLike | null {
    return editor.getContribution(SUGGEST_CONTROLLER_ID) as SuggestControllerLike | null
}

function querySuggestRoots(editor: monaco.editor.IStandaloneCodeEditor): ParentNode[] {
    const roots: ParentNode[] = []
    const overflow = (editor as EditorWithOverflowHost).getOverflowWidgetsDomNode?.()
    if (overflow) roots.push(overflow)
    const dom = editor.getDomNode()
    if (dom && dom !== overflow) roots.push(dom)
    return roots
}

function querySuggestWidget(editor: monaco.editor.IStandaloneCodeEditor): HTMLElement | null {
    for (const root of querySuggestRoots(editor)) {
        const hit = root.querySelector('.suggest-widget') as HTMLElement | null
        if (hit) return hit
    }
    return null
}

function readSuggestFont(widget: HTMLElement): string {
    const main = widget.querySelector('.monaco-list-row .main') as HTMLElement | null
    if (main && typeof getComputedStyle === 'function') {
        const cs = getComputedStyle(main)
        if (cs?.fontFamily) {
            return `${cs.fontWeight || '400'} ${cs.fontSize || '12px'} ${cs.fontFamily}`
        }
    }
    return '500 12px ui-monospace, "SF Mono", Consolas, monospace'
}

function measureVisibleRowsWidth(widget: HTMLElement, font: string): number {
    let max = 0
    const rows = widget.querySelectorAll('.monaco-list-row')
    for (const row of rows) {
        if (!(row instanceof HTMLElement)) continue
        if (row.getAttribute('aria-hidden') === 'true') continue
        const label =
            row.querySelector('.monaco-icon-label .label-name')?.textContent?.trim() ??
            row.querySelector('.monaco-icon-label')?.textContent?.trim() ??
            ''
        const detail = row.querySelector('.signature-label')?.textContent?.trim() ?? ''
        const description = row.querySelector('.details-label')?.textContent?.trim() ?? ''
        const contents = row.querySelector('.contents') as HTMLElement | null
        const fromDom = contents ? contents.scrollWidth + 8 : 0
        const fromText = estimateSuggestRowWidthPx({label, detail, description, font})
        max = Math.max(max, fromDom, fromText)
    }
    return max
}

/**
 * 按当前可见补全行加宽 suggest 弹层（默认只扩不缩，避免焦点切换时来回抖）。
 * 返回最终采用的宽度；无需调整时返回 null。
 */
export function fitSqlSuggestWidgetWidth(
    editor: monaco.editor.IStandaloneCodeEditor,
    options?: {allowShrink?: boolean},
): number | null {
    const widget = querySuggestWidget(editor)
    if (!widget) return null
    const visible =
        widget.classList.contains('visible') ||
        (widget.offsetWidth > 0 && widget.offsetHeight > 0)
    if (!visible) return null

    const font = readSuggestFont(widget)
    const neededRaw = measureVisibleRowsWidth(widget, font)
    if (neededRaw <= 0) return null

    const viewport = typeof window !== 'undefined' ? window.innerWidth : 1280
    const needed = clampSuggestWidgetWidth(neededRaw, viewport)
    const current =
        widget.offsetWidth ||
        Number.parseFloat(widget.style.width || '') ||
        SUGGEST_WIDTH_MIN

    const allowShrink = options?.allowShrink === true
    const next = allowShrink ? needed : Math.max(current, needed)
    if (Math.abs(next - current) < 2) return current

    widget.style.width = `${next}px`
    widget.style.minWidth = `${SUGGEST_WIDTH_MIN}px`

    const list = widget.querySelector('.monaco-list') as HTMLElement | null
    const tree = widget.querySelector('.tree') as HTMLElement | null
    if (list) {
        list.style.width = `${next}px`
        void list.offsetWidth
    }
    if (tree) tree.style.width = `${next}px`

    return next
}

export function resetSqlSuggestWidgetWidth(editor: monaco.editor.IStandaloneCodeEditor): void {
    const widget = querySuggestWidget(editor)
    if (!widget) return
    widget.style.width = ''
    widget.style.minWidth = ''
    const list = widget.querySelector('.monaco-list') as HTMLElement | null
    const tree = widget.querySelector('.tree') as HTMLElement | null
    if (list) list.style.width = ''
    if (tree) tree.style.width = ''
}

/** 弹层打开/换项时按内容加宽；关闭时清掉内联宽度 */
export function bindSqlSuggestWidgetWidth(
    editor: monaco.editor.IStandaloneCodeEditor,
): monaco.IDisposable {
    const disposables: monaco.IDisposable[] = []
    let widgetBound = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const scheduleFit = (allowShrink: boolean) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
            timer = null
            requestAnimationFrame(() => {
                fitSqlSuggestWidgetWidth(editor, {allowShrink})
                requestAnimationFrame(() => fitSqlSuggestWidgetWidth(editor, {allowShrink: false}))
            })
        }, 0)
    }

    const bindWidget = (): boolean => {
        if (widgetBound) return true
        const widget = getSuggestController(editor)?.widget?.value
        if (!widget) return false
        widgetBound = true
        disposables.push(widget.onDidShow(() => scheduleFit(true)))
        disposables.push(widget.onDidFocus(() => scheduleFit(false)))
        disposables.push(
            widget.onDidHide(() => {
                resetSqlSuggestWidgetWidth(editor)
            }),
        )
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
            if (timer) clearTimeout(timer)
            resetSqlSuggestWidgetWidth(editor)
            for (const d of disposables) d.dispose()
        },
    }
}
