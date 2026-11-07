import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {NavModule, SettingsSection, WorkspaceTabType} from '@/core/types'

/**
 * Feature Contract contribution shapes (A-09 / A-10 / A-15).
 * Loaders stay forked (in-process Vue vs community iframe); contribution *surface* is shared.
 */

/**
 * In-process Vue tab registration (S1+). Community iframe tabs stay on the
 * dedicated community-workbench path — do not contribute those here.
 */
export interface FeatureTabContribution {
    type: WorkspaceTabType
    loader: LazyViewLoader
    /** Matches KeepAlive include / SFC defineOptions.name on the async wrapper. */
    asyncName?: string
}

/** Host-resolved palette action — no feature→store closure in the manifest. */
export type FeaturePaletteAction =
    | {kind: 'setModule'; module: NavModule}
    | {kind: 'openConnectorMarket'}
    | {kind: 'openPluginDevTools'}
    | {kind: 'openDataCatalog'}
    | {kind: 'openSettings'; section: SettingsSection; anchor?: string}

/** Optional host gate before a palette contribution is listed. */
export type FeaturePaletteWhen = 'pluginDevVisible' | 'nonStandardEdition'

export interface FeaturePaletteContribution {
    id: string
    labelKey: string
    groupKey: string
    hintKey?: string
    /** Lower first; default 1000. Stabilizes nav module order across features. */
    order?: number
    when?: FeaturePaletteWhen
    action: FeaturePaletteAction
}

/**
 * Additive settings-nav item. Merged into host groups by `groupKey` (A-15-SET).
 * Built-in `SETTINGS_NAV_GROUPS` remain the baseline; features append.
 */
export interface FeatureSettingsContribution {
    id: SettingsSection | (string & {})
    labelKey: string
    /** Must match a host `SettingsNavGroup.labelKey` (e.g. settings.nav.groups.ai). */
    groupKey: string
    adminOnly?: boolean
    multiOnly?: boolean
    order?: number
}

/**
 * Declarative menu contribution (A-15-MENU).
 * Host resolves `slot` + `action`; no feature→store closures in the manifest.
 */
export type FeatureMenuAction =
    | {kind: 'setModule'; module: NavModule}
    | {kind: 'openSettings'; section: SettingsSection; anchor?: string}
    | {kind: 'openDataCatalog'}
    | {kind: 'openConnectorMarket'}

export interface FeatureMenuContribution {
    id: string
    /** Host menu slot, e.g. `command-palette` adjacent slots or future explorer slots. */
    slot: string
    labelKey: string
    groupKey?: string
    order?: number
    when?: FeaturePaletteWhen
    action: FeatureMenuAction
}

/** Shell slot ids rendered by MainContent (not ModuleWorkbench pages). */
export type FeatureShellSlot = 'database' | 'ai'

/**
 * Host workspace-open ids. Handlers live in layout (features), not in core.
 * Adding a new id requires a matching dispatch case — never `if (module === '…')` in setModule.
 */
export type FeatureWorkspaceOpenId = 'communityPluginCenter'

/**
 * How a NavModule participates in the shell (A-10).
 * - shell-slot: MainContent shows a named shell (database workbench / AI)
 * - workspace-open: setModule opens a workspace surface; does not switch activeModule
 * - module-page: ModuleWorkbench registry modules (explicit; default behavior if absent)
 */
export type FeatureNavModuleKind = 'shell-slot' | 'workspace-open' | 'module-page'

export interface FeatureNavModuleContribution {
    module: NavModule
    kind: FeatureNavModuleKind
    /** Required when kind is shell-slot */
    shell?: FeatureShellSlot
    /** Required when kind is workspace-open */
    open?: FeatureWorkspaceOpenId
    /**
     * Required for module-page once migrated off MODULE_LOADERS (ENG-06).
     * Same LazyViewLoader shape as FeatureTabContribution.
     */
    loader?: LazyViewLoader
    /** Optional async wrapper name (module pages are not KeepAlive’d today). */
    asyncName?: string
}

export interface FeatureContributions {
    palette?: FeaturePaletteContribution[]
    settings?: FeatureSettingsContribution[]
    menus?: FeatureMenuContribution[]
    navModules?: FeatureNavModuleContribution[]
    tabs?: FeatureTabContribution[]
}

export interface FeatureDefinition {
    id: string
    contributes?: FeatureContributions
}
