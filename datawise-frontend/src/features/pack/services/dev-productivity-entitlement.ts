import type {EntitlementMode, SuiteId} from '@/features/pack/types/pack.types'

/** §3.1 / §3.3 — Dev productivity plugins gifted with Pro+ suites (Wave 39). */
export const DEV_PRODUCTIVITY_PLUGIN_IDS = [
    'p-table-codegen',
    'p-dml-generate',
    'p-grid-edit',
] as const

export type DevProductivityPluginId = (typeof DEV_PRODUCTIVITY_PLUGIN_IDS)[number]

export function isDevProductivityPlugin(pluginId: string): boolean {
    return (DEV_PRODUCTIVITY_PLUGIN_IDS as readonly string[]).includes(pluginId)
}

export function hasDevProductivityAccess(options: {
    mode: EntitlementMode
    suiteId?: SuiteId | null
}): boolean {
    if (options.mode === 'open') return true
    const suite = options.suiteId
    return suite === 'suite.pro' || suite === 'suite.enterprise' || suite === 'suite.platform'
}
