import type {NavModule, WorkspaceTabType} from '@/core/types'
import type {
    FeatureDefinition,
    FeatureMenuContribution,
    FeatureNavModuleContribution,
    FeaturePaletteContribution,
    FeatureSettingsContribution,
    FeatureShellSlot,
    FeatureTabContribution,
} from '@/core/feature-contract/types'

const features = new Map<string, FeatureDefinition>()

/** Register builtin (and later pack) features once at boot. Duplicate ids replace. */
export function registerFeatures(defs: FeatureDefinition[]): void {
    for (const def of defs) {
        features.set(def.id, def)
    }
}

/** Test / HMR helper — clears the runtime registry. */
export function resetFeatureRegistry(): void {
    features.clear()
}

export function listRegisteredFeatures(): FeatureDefinition[] {
    return [...features.values()]
}

export function listFeaturePaletteContributions(): FeaturePaletteContribution[] {
    const out: FeaturePaletteContribution[] = []
    for (const feature of features.values()) {
        const items = feature.contributes?.palette
        if (items?.length) out.push(...items)
    }
    return out.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000))
}

export function listFeatureSettingsContributions(): FeatureSettingsContribution[] {
    const out: FeatureSettingsContribution[] = []
    for (const feature of features.values()) {
        const items = feature.contributes?.settings
        if (items?.length) out.push(...items)
    }
    return out.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000))
}

export function listFeatureMenuContributions(): FeatureMenuContribution[] {
    const out: FeatureMenuContribution[] = []
    for (const feature of features.values()) {
        const items = feature.contributes?.menus
        if (items?.length) out.push(...items)
    }
    return out.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000))
}

export function listFeatureMenuContributionsForSlot(slot: string): FeatureMenuContribution[] {
    return listFeatureMenuContributions().filter((entry) => entry.slot === slot)
}

export function listFeatureNavModuleContributions(): FeatureNavModuleContribution[] {
    const out: FeatureNavModuleContribution[] = []
    for (const feature of features.values()) {
        const items = feature.contributes?.navModules
        if (items?.length) out.push(...items)
    }
    return out
}

export function listFeatureTabContributions(): FeatureTabContribution[] {
    const out: FeatureTabContribution[] = []
    for (const feature of features.values()) {
        const items = feature.contributes?.tabs
        if (items?.length) out.push(...items)
    }
    return out
}

/** Last contribution wins when multiple features claim the same type (boot should assert uniqueness). */
export function resolveFeatureTabContribution(type: WorkspaceTabType): FeatureTabContribution | undefined {
    let found: FeatureTabContribution | undefined
    for (const entry of listFeatureTabContributions()) {
        if (entry.type === type) found = entry
    }
    return found
}

/** First contribution that claims this NavModule (later features can replace via same module — last wins). */
export function resolveNavModuleContribution(module: NavModule): FeatureNavModuleContribution | undefined {
    let found: FeatureNavModuleContribution | undefined
    for (const entry of listFeatureNavModuleContributions()) {
        if (entry.module === module) found = entry
    }
    return found
}

export function resolveShellSlotForModule(module: NavModule): FeatureShellSlot | null {
    const entry = resolveNavModuleContribution(module)
    if (entry?.kind === 'shell-slot' && entry.shell) return entry.shell
    // Fallback when registerBuiltinFeatures has not run yet (unit tests / early import).
    if (module === 'database') return 'database'
    if (module === 'ai') return 'ai'
    return null
}
