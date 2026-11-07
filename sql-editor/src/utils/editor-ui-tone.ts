/** 由 Monaco 主题名推断 UI 明暗（设置面板与编辑器对齐） */
export function resolveEditorUiTone(theme?: string | null): 'dark' | 'light' {
    const name = (theme ?? 'vs-dark').toLowerCase()
    if (name.includes('light') || name === 'vs' || name === 'hc-light') return 'light'
    return 'dark'
}
