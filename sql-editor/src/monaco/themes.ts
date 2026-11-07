import * as monaco from 'monaco-editor'

const DARK_MINIMAP: Record<string, string> = {
    'minimap.background': '#2a2c38',
    'minimapSlider.background': '#ffffff0a',
    'minimapSlider.hoverBackground': '#a78bfa18',
}

const LIGHT_MINIMAP: Record<string, string> = {
    'minimap.background': '#f3f4f6',
    'minimapSlider.background': '#0f172a08',
    'minimapSlider.hoverBackground': '#7c3aed12',
}

/** 补全弹层：主文字再提亮一档，右侧类型仍弱一级 */
const DARK_SUGGEST: Record<string, string> = {
    'editorSuggestWidget.background': '#2c313c',
    'editorSuggestWidget.border': '#3e4451',
    'editorSuggestWidget.foreground': '#f5f6f8',
    // 须与 background 有差，否则选中行看不见
    'editorSuggestWidget.selectedBackground': '#3a4050',
    'editorSuggestWidget.selectedForeground': '#ffffff',
    'editorSuggestWidget.selectedIconForeground': '#ffffff',
    'editorSuggestWidget.highlightForeground': '#8cc2ff',
    'editorSuggestWidget.focusHighlightForeground': '#b3d7ff',
    'editorSuggestWidgetStatus.foreground': '#b4bcc8',
}

/** 补全弹层（light） */
const LIGHT_SUGGEST: Record<string, string> = {
    'editorSuggestWidget.background': '#ffffff',
    'editorSuggestWidget.border': '#d0d7de',
    'editorSuggestWidget.foreground': '#24292f',
    'editorSuggestWidget.selectedBackground': '#f6f8fa',
    'editorSuggestWidget.selectedForeground': '#24292f',
    'editorSuggestWidget.selectedIconForeground': '#0969da',
    'editorSuggestWidget.highlightForeground': '#0969da',
    'editorSuggestWidget.focusHighlightForeground': '#0550ae',
    'editorSuggestWidgetStatus.foreground': '#656d76',
}

const THEMES: Record<string, monaco.editor.IStandaloneThemeData> = {
    'one-dark': {
        base: 'vs-dark',
        inherit: true,
        rules: [
            {token: 'comment', foreground: '5c6370', fontStyle: 'italic'},
            {token: 'keyword', foreground: 'c678dd', fontStyle: 'bold'},
            {token: 'string', foreground: '98c379'},
            {token: 'number', foreground: 'd19a66'},
            {token: 'type', foreground: 'e5c07b'},
            {token: 'function', foreground: '61afef'},
        ],
        colors: {
            'editor.background': '#282c34',
            'editor.foreground': '#abb2bf',
            'editorLineNumber.foreground': '#5c6370',
            'editor.lineHighlightBackground': '#2c313a',
            'editor.selectionBackground': '#3d6a9ecc',
            'editor.inactiveSelectionBackground': '#3d6a9e66',
            'editor.selectionHighlightBackground': '#3d6a9e55',
            'editorGutter.background': '#282c34',
            ...DARK_MINIMAP,
            ...DARK_SUGGEST,
        },
    },
    'github-light': {
        base: 'vs',
        inherit: true,
        rules: [
            {token: 'comment', foreground: '6e7781', fontStyle: 'italic'},
            {token: 'keyword', foreground: 'cf222e', fontStyle: 'bold'},
            {token: 'string', foreground: '0a3069'},
            {token: 'number', foreground: '0550ae'},
            {token: 'type', foreground: '953800'},
        ],
        colors: {
            'editor.background': '#ffffff',
            'editor.foreground': '#24292f',
            'editorLineNumber.foreground': '#8c959f',
            'editor.lineHighlightBackground': '#f6f8fa',
            'editor.selectionBackground': '#add6ff',
            'editor.inactiveSelectionBackground': '#add6ff99',
            'editor.selectionHighlightBackground': '#add6ff66',
            'editorGutter.background': '#ffffff',
            ...LIGHT_MINIMAP,
            ...LIGHT_SUGGEST,
        },
    },
}

let registered = false

/** 可重复调用：HMR / 主题色调整后需重新 defineTheme 才会生效 */
export function ensureSqlEditorMonacoThemes() {
    for (const [id, definition] of Object.entries(THEMES)) {
        monaco.editor.defineTheme(id, definition)
    }
    registered = true
}

export function applySqlEditorMonacoTheme(theme: string) {
    ensureSqlEditorMonacoThemes()
    monaco.editor.setTheme(theme)
}
