export type EditorThemeId = 'one-dark' | 'github-light'

export interface EditorSettings {
    theme: EditorThemeId
    fontFamily: string
    fontSize: number
    lineHeight: number
    lineNumbers: boolean
    minimap: boolean
    wordWrap: boolean
    /** 代码块折叠（行号旁折叠控件） */
    folding: boolean
    /** SQL 查询与打开表的最大返回行数；0 表示不限制 */
    maxResultRows: number
    /** 结果网格默认每页条数；0 表示使用当前列表最小值 */
    defaultGridPageSize: number
    /** 慢查询阈值（毫秒）；耗时 ≥ 此值时在日志与结果区标红 */
    slowQueryThresholdMs: number
    /** 连接标记为生产环境时收紧行数上限并启用正式版性能诊断日志 */
    productionPerfMode: boolean
}

export const SLOW_QUERY_THRESHOLD_MIN = 100
export const SLOW_QUERY_THRESHOLD_MAX = 600_000
export const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 3000

export const EDITOR_STORAGE_KEY = 'dw-cli-editor-settings'

export const EDITOR_FONT_SIZE_MIN = 12
export const EDITOR_FONT_SIZE_MAX = 24
export const EDITOR_LINE_HEIGHT_MIN = 1
export const EDITOR_LINE_HEIGHT_MAX = 3
export const MAX_RESULT_ROWS_MIN = 0
export const MAX_RESULT_ROWS_MAX = 1_000_000

/** 结果网格分页可选条数 */
export const GRID_PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000] as const
export type GridPageSizeValue = typeof GRID_PAGE_SIZE_OPTIONS[number]

/** SQL 控制台结果网格分页（不含 1000） */
export const CONSOLE_GRID_PAGE_SIZE_OPTIONS = GRID_PAGE_SIZE_OPTIONS.slice(0, 4).map(String)

/** 0 表示使用当前列表中的最小分页条数 */
export const DEFAULT_GRID_PAGE_SIZE = 0

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
    theme: 'one-dark',
    fontFamily: 'JetBrains Mono',
    fontSize: 14,
    lineHeight: 1.5,
    lineNumbers: true,
    minimap: true,
    wordWrap: true,
    folding: true,
    maxResultRows: 5000,
    defaultGridPageSize: DEFAULT_GRID_PAGE_SIZE,
    slowQueryThresholdMs: DEFAULT_SLOW_QUERY_THRESHOLD_MS,
    productionPerfMode: true,
}

export const EDITOR_THEME_OPTIONS: EditorThemeId[] = ['one-dark', 'github-light']

export const EDITOR_FONT_OPTIONS = [
    'Monaco',
    'Consolas',
    'Courier New',
    'JetBrains Mono',
] as const

export const LEGACY_THEME_MAP: Record<string, EditorThemeId> = {
    'datawise-dark': 'one-dark',
    'datawise-light': 'github-light',
    vs: 'github-light',
    'vs-dark': 'one-dark',
    dracula: 'one-dark',
    'github-dark': 'one-dark',
    'monokai-bright': 'github-light',
    monokai: 'one-dark',
    'solarized-dark': 'one-dark',
    'solarized-light': 'github-light',
    xcode: 'github-light',
    'hc-light': 'github-light',
    'hc-black': 'one-dark',
}

export const EDITOR_PREVIEW_SQL = `-- Editor Settings Preview
CREATE TABLE editor_settings (
  id INT PRIMARY KEY,
  theme VARCHAR(64) NOT NULL,
  font_size INT DEFAULT 14,
  line_height DECIMAL(3, 1) DEFAULT 1.5,
  show_minimap TINYINT(1) DEFAULT 1
);

INSERT INTO editor_settings (id, theme, font_size)
VALUES (1, 'one-dark', 14);

UPDATE editor_settings
SET line_height = 1.5
WHERE id = 1;

SELECT theme, font_size, line_height
FROM editor_settings
WHERE show_minimap = 1;

CREATE PROCEDURE refresh_editor_preview()
BEGIN
  SELECT 'Monaco preview is live' AS message;
END;
`
