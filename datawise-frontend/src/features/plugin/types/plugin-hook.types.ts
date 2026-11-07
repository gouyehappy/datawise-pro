import type {TableColumn, TableRow} from '@/core/types'

export type PluginHookName = 'beforeExecute' | 'afterResult' | 'renderGrid'

export interface PluginBeforeExecuteContext {
    pluginId: string
    sql: string
    connectionId: string
    database?: string
}

export interface PluginBeforeExecuteResult {
    sql?: string
    cancel?: boolean
    message?: string
}

export interface PluginAfterResultContext {
    pluginId: string
    sql: string
    connectionId: string
    database?: string
    success: boolean
    rowCount?: number
    durationMs?: number
    errorMessage?: string
}

export interface PluginRenderGridContext {
    pluginId: string
    columns: TableColumn[]
    rows: TableRow[]
    connectionId?: string
    database?: string
}

export interface PluginRenderGridResult {
    columns?: TableColumn[]
    rows?: TableRow[]
}

export type PluginBeforeExecuteHook = (
    context: PluginBeforeExecuteContext,
) => PluginBeforeExecuteResult | void | Promise<PluginBeforeExecuteResult | void>

export type PluginAfterResultHook = (
    context: PluginAfterResultContext,
) => void | Promise<void>

export type PluginRenderGridHook = (
    context: PluginRenderGridContext,
) => PluginRenderGridResult | void

export interface PluginHookHandlers {
    beforeExecute?: PluginBeforeExecuteHook
    afterResult?: PluginAfterResultHook
    renderGrid?: PluginRenderGridHook
}
