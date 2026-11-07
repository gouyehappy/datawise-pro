import type {FeatureDefinition} from '@/core/feature-contract/types'

/** Validate and freeze a feature manifest for runtime registration. */
export function defineFeature(definition: FeatureDefinition): FeatureDefinition {
    const id = definition.id?.trim()
    if (!id) {
        throw new Error('defineFeature: id is required')
    }
    const palette = definition.contributes?.palette ?? []
    for (const entry of palette) {
        if (!entry.id?.trim()) {
            throw new Error(`defineFeature(${id}): palette contribution missing id`)
        }
        if (!entry.labelKey?.trim() || !entry.groupKey?.trim()) {
            throw new Error(`defineFeature(${id}): palette ${entry.id} needs labelKey/groupKey`)
        }
        if (!entry.action?.kind) {
            throw new Error(`defineFeature(${id}): palette ${entry.id} needs action.kind`)
        }
    }
    const settings = definition.contributes?.settings ?? []
    for (const entry of settings) {
        if (!entry.id || !String(entry.id).trim()) {
            throw new Error(`defineFeature(${id}): settings contribution missing id`)
        }
        if (!entry.labelKey?.trim() || !entry.groupKey?.trim()) {
            throw new Error(`defineFeature(${id}): settings ${String(entry.id)} needs labelKey/groupKey`)
        }
    }
    const menus = definition.contributes?.menus ?? []
    for (const entry of menus) {
        if (!entry.id?.trim()) {
            throw new Error(`defineFeature(${id}): menus contribution missing id`)
        }
        if (!entry.slot?.trim()) {
            throw new Error(`defineFeature(${id}): menus ${entry.id} needs slot`)
        }
        if (!entry.labelKey?.trim()) {
            throw new Error(`defineFeature(${id}): menus ${entry.id} needs labelKey`)
        }
        if (!entry.action?.kind) {
            throw new Error(`defineFeature(${id}): menus ${entry.id} needs action.kind`)
        }
    }
    const navModules = definition.contributes?.navModules ?? []
    for (const entry of navModules) {
        if (!entry.module) {
            throw new Error(`defineFeature(${id}): navModules entry missing module`)
        }
        if (!entry.kind) {
            throw new Error(`defineFeature(${id}): navModules ${entry.module} missing kind`)
        }
        if (entry.kind === 'shell-slot' && !entry.shell) {
            throw new Error(`defineFeature(${id}): navModules ${entry.module} shell-slot needs shell`)
        }
        if (entry.kind === 'workspace-open' && !entry.open) {
            throw new Error(`defineFeature(${id}): navModules ${entry.module} workspace-open needs open`)
        }
        if (entry.kind === 'module-page' && entry.loader != null && typeof entry.loader !== 'function') {
            throw new Error(`defineFeature(${id}): navModules ${entry.module} module-page loader must be a function`)
        }
        if (entry.kind !== 'module-page' && entry.loader != null) {
            throw new Error(`defineFeature(${id}): navModules ${entry.module} loader only allowed on module-page`)
        }
    }
    const tabs = definition.contributes?.tabs ?? []
    const seenTabTypes = new Set<string>()
    for (const entry of tabs) {
        if (!entry.type) {
            throw new Error(`defineFeature(${id}): tabs contribution missing type`)
        }
        if (typeof entry.loader !== 'function') {
            throw new Error(`defineFeature(${id}): tabs ${entry.type} needs loader`)
        }
        if (seenTabTypes.has(entry.type)) {
            throw new Error(`defineFeature(${id}): duplicate tabs type ${entry.type}`)
        }
        seenTabTypes.add(entry.type)
    }
    return {
        id,
        contributes: definition.contributes,
    }
}
