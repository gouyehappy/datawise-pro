import type {WorkspaceTab} from '@/core/types'
import {viewModelApi} from '@/api/modules/view-model'
import {nextViewModelTabName} from '@/features/explorer/services/view-model-naming'

export async function resolveNextViewModelNameForOpen(options: {
    tabs: WorkspaceTab[]
    connectionId: string
    instanceId?: string | null
    database?: string
    excludeTabId?: string
}): Promise<string> {
    const scopedTabs = options.tabs.filter(
        (tab) =>
            tab.type === 'view_model_editor'
            && tab.connectionId === options.connectionId
            && (options.instanceId == null || tab.instanceId === options.instanceId)
            && tab.id !== options.excludeTabId,
    )
    const tabNames = scopedTabs
        .map((tab) => tab.viewModelName?.trim())
        .filter((name): name is string => !!name)

    let diskNames: string[] = []
    const instanceName = options.database?.trim()
    if (instanceName) {
        try {
            const scripts = await viewModelApi.list({
                connectionId: options.connectionId,
                instanceName,
            })
            diskNames = scripts.map((item) => item.name)
        } catch {
            diskNames = []
        }
    }

    return nextViewModelTabName([...tabNames, ...diskNames])
}
