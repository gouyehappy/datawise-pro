import type {WorkspaceTab, WorkspaceTabParams} from '@/core/types'

/** Ensure tab.params exists (mutates) and return it. */
export function ensureTabParams(tab: WorkspaceTab): WorkspaceTabParams {
    if (!tab.params) tab.params = {}
    return tab.params
}

export function getTabParam<K extends keyof WorkspaceTabParams>(
    tab: WorkspaceTab,
    key: K,
): WorkspaceTabParams[K] | undefined {
    return tab.params?.[key]
}

export function setTabParam<K extends keyof WorkspaceTabParams>(
    tab: WorkspaceTab,
    key: K,
    value: WorkspaceTabParams[K],
): void {
    ensureTabParams(tab)[key] = value
}

export function patchTabParams(tab: WorkspaceTab, patch: Partial<WorkspaceTabParams>): void {
    tab.params = {...tab.params, ...patch}
}
