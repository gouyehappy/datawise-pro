/**
 * 导航模块 → 页面组件注册表
 *
 * Shell slots（database / AI）由 Feature Contract `navModules` + MainContent 渲染（A-10）；
 * communityPlugin 为 workspace-open 贡献，无模块页。
 * ModuleWorkbench 页面经 Feature Contract `module-page` + loader（ENG-06）；静态 MODULE_LOADERS 已清空。
 */
import type {Component} from 'vue'
import type {NavModule} from '@/core/types'
import {listFeatureNavModuleContributions} from '@/core/feature-contract'
import {createRegistry, resolveRegistryComponent} from '@/core/registry/create-registry'
import {
    createLazyView,
    prefetchLazyLoaders,
    type LazyViewLoader,
} from '@/core/registry/create-lazy-view'

/** Reserved for emergency static fallbacks — prefer Feature Contract module-page loaders. */
const MODULE_LOADERS = {} as const satisfies Record<string, LazyViewLoader>

type RegisteredModule = keyof typeof MODULE_LOADERS

const definitions = (Object.keys(MODULE_LOADERS) as RegisteredModule[]).map((key) => ({
    key,
    component: createLazyView(MODULE_LOADERS[key]),
}))

export const WORKBENCH_MODULE_REGISTRY = createRegistry(definitions)

export const WORKBENCH_MODULE_WARMUP: NavModule[] = [
    'dashboard',
    'settings',
]

const contributionComponentCache = new Map<string, Component>()

/** Test helper — clear lazy contribution wrappers after resetFeatureRegistry. */
export function resetWorkbenchModuleContributionCache(): void {
    contributionComponentCache.clear()
}

function listModulePageContributionsWithLoader() {
    return listFeatureNavModuleContributions().filter(
        (entry) => entry.kind === 'module-page' && typeof entry.loader === 'function',
    )
}

/**
 * Fail-fast after registerBuiltinFeatures: no static∪contribution or cross-feature duplicates.
 */
export function assertWorkbenchModuleContributionsValid(): void {
    const byModule = new Map<NavModule, number>()
    for (const entry of listModulePageContributionsWithLoader()) {
        if (entry.module in MODULE_LOADERS) {
            throw new Error(
                `workbench module "${entry.module}" is both in MODULE_LOADERS and feature contributions`,
            )
        }
        byModule.set(entry.module, (byModule.get(entry.module) ?? 0) + 1)
    }
    for (const [module, count] of byModule) {
        if (count > 1) {
            throw new Error(`workbench module "${module}" contributed ${count} times`)
        }
    }
}

export function resolveWorkbenchModule(module: NavModule): Component | null {
    const staticHit = resolveRegistryComponent(
        WORKBENCH_MODULE_REGISTRY,
        module as keyof typeof WORKBENCH_MODULE_REGISTRY,
    )
    const contributed = listModulePageContributionsWithLoader().filter(
        (entry) => entry.module === module,
    )

    if (staticHit && contributed.length > 0) {
        throw new Error(
            `workbench module "${module}" is both in MODULE_LOADERS and feature contributions`,
        )
    }
    if (contributed.length > 1) {
        throw new Error(`workbench module "${module}" contributed ${contributed.length} times`)
    }
    if (staticHit) return staticHit

    const entry = contributed[0]
    if (!entry?.loader) return null

    let cached = contributionComponentCache.get(module)
    if (!cached) {
        cached = createLazyView(entry.loader, entry.asyncName ? {name: entry.asyncName} : undefined)
        contributionComponentCache.set(module, cached)
    }
    return cached
}

export function prefetchWorkbenchModules(
    modules: readonly NavModule[] = WORKBENCH_MODULE_WARMUP,
): Promise<void> {
    const loaders: Array<LazyViewLoader | null | undefined> = modules.map((module) => {
        if (module in MODULE_LOADERS) return MODULE_LOADERS[module as RegisteredModule]
        const entry = listModulePageContributionsWithLoader().find((c) => c.module === module)
        return entry?.loader
    })
    return prefetchLazyLoaders(loaders)
}
