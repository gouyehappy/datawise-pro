/** 游标「加载更多」累计行数超过此阈值时在工具栏提示用户收窄查询或导出 */
export const CURSOR_LOADED_ROWS_WARN_THRESHOLD = 10_000

/** 游标结果在内存中保留的最大行数；超出时丢弃最早批次（FIFO 滑动窗口） */
export const CURSOR_LOADED_ROWS_MAX = 15_000

/** 危险 SQL 确认预览的 pageSize / maxRows */
export const DANGEROUS_SQL_PREVIEW_ROWS = 20

/** 结果 Diff 最多逐行比对的行数（避免大结果集 stringify 打爆主线程） */
export const QUERY_RESULT_DIFF_MAX_COMPARE_ROWS = 2_000

/** 图表推断与渲染使用的最大采样行数 */
export const QUERY_RESULT_CHART_SAMPLE_ROWS = 5_000

/** 列统计扫描的最大行数 */
export const GRID_COLUMN_STATS_MAX_ROWS = 5_000

/** 列统计 distinct 映射上限（超出后仍计 distinctCount 近似） */
export const GRID_COLUMN_STATS_MAX_DISTINCT = 500
