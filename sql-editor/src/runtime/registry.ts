import {createSqlEditorRuntime} from '@sql-editor/runtime/create-runtime'
import type {SqlEditorRuntime} from '@sql-editor/types'

let defaultRuntime: SqlEditorRuntime | null = null
let activeRuntime: SqlEditorRuntime | null = null

export function getDefaultSqlEditorRuntime(): SqlEditorRuntime {
    if (!defaultRuntime) defaultRuntime = createSqlEditorRuntime()
    return defaultRuntime
}

export function setDefaultSqlEditorRuntime(runtime: SqlEditorRuntime): void {
    defaultRuntime = runtime
    setActiveSqlEditorRuntime(runtime)
}

/** 补全 Provider 与 alias 工具读取的当前运行时 */
export function getActiveSqlEditorRuntime(): SqlEditorRuntime {
    return activeRuntime ?? getDefaultSqlEditorRuntime()
}

export function setActiveSqlEditorRuntime(
    runtime: SqlEditorRuntime,
    options?: { sync?: boolean },
): void {
    activeRuntime = runtime
    if (options?.sync !== false) runtime.sync()
}

export function resetActiveSqlEditorRuntime(): void {
    activeRuntime = null
}
