import type {
    PluginAfterResultContext,
    PluginBeforeExecuteContext,
    PluginBeforeExecuteResult,
    PluginHookHandlers,
    PluginHookName,
    PluginRenderGridContext,
    PluginRenderGridResult,
} from '@/features/plugin/types/plugin-hook.types'
import type {TableColumn, TableRow} from '@/core/types'
import {normalizePluginId} from '@/features/plugin/services/plugin-registry.service'

type HookRegistry = {
    beforeExecute: Map<string, PluginHookHandlers['beforeExecute']>
    afterResult: Map<string, PluginHookHandlers['afterResult']>
    renderGrid: Map<string, PluginHookHandlers['renderGrid']>
}

const registry: HookRegistry = {
    beforeExecute: new Map(),
    afterResult: new Map(),
    renderGrid: new Map(),
}

function hookMap(name: PluginHookName) {
    return registry[name]
}

export function registerPluginHooks(pluginId: string, handlers: PluginHookHandlers): void {
    const id = normalizePluginId(pluginId)
    if (handlers.beforeExecute) registry.beforeExecute.set(id, handlers.beforeExecute)
    if (handlers.afterResult) registry.afterResult.set(id, handlers.afterResult)
    if (handlers.renderGrid) registry.renderGrid.set(id, handlers.renderGrid)
}

export function unregisterPluginHooks(pluginId: string): void {
    const id = normalizePluginId(pluginId)
    registry.beforeExecute.delete(id)
    registry.afterResult.delete(id)
    registry.renderGrid.delete(id)
}

export function clearPluginHooks(): void {
    registry.beforeExecute.clear()
    registry.afterResult.clear()
    registry.renderGrid.clear()
}

export function listRegisteredPluginHooks(): Record<PluginHookName, string[]> {
    return {
        beforeExecute: [...registry.beforeExecute.keys()],
        afterResult: [...registry.afterResult.keys()],
        renderGrid: [...registry.renderGrid.keys()],
    }
}

export async function runPluginBeforeExecute(
    context: Omit<PluginBeforeExecuteContext, 'pluginId'>,
    isEnabled: (pluginId: string) => boolean,
): Promise<PluginBeforeExecuteResult> {
    let sql = context.sql
    for (const [pluginId, hook] of registry.beforeExecute) {
        if (!hook || !isEnabled(pluginId)) continue
        const result = await hook({...context, pluginId, sql})
        if (!result) continue
        if (result.sql?.trim()) sql = result.sql
        if (result.cancel) {
            return {cancel: true, message: result.message, sql}
        }
    }
    return {sql}
}

export async function runPluginAfterResult(
    context: Omit<PluginAfterResultContext, 'pluginId'>,
    isEnabled: (pluginId: string) => boolean,
): Promise<void> {
    for (const [pluginId, hook] of registry.afterResult) {
        if (!hook || !isEnabled(pluginId)) continue
        await hook({...context, pluginId})
    }
}

export function applyPluginRenderGrid(
    columns: TableColumn[],
    rows: TableRow[],
    context: Omit<PluginRenderGridContext, 'pluginId' | 'columns' | 'rows'>,
    isEnabled: (pluginId: string) => boolean,
): {columns: TableColumn[]; rows: TableRow[]} {
    let nextColumns = columns
    let nextRows = rows
    for (const [pluginId, hook] of registry.renderGrid) {
        if (!hook || !isEnabled(pluginId)) continue
        const result: PluginRenderGridResult | void = hook({
            ...context,
            pluginId,
            columns: nextColumns,
            rows: nextRows,
        })
        if (!result) continue
        if (result.columns) nextColumns = result.columns
        if (result.rows) nextRows = result.rows
    }
    return {columns: nextColumns, rows: nextRows}
}
