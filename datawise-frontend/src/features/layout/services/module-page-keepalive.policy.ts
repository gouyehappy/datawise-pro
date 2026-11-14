/**
 * PERF-06: ModuleWorkbench pages (Settings / Dashboard / …) stay warm via Vue KeepAlive.
 * Cap is small — these pages can hold search state, scroll, and panel trees.
 */
export const MODULE_PAGE_KEEPALIVE_MAX = 2
