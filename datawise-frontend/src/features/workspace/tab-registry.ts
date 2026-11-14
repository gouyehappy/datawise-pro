/**
 * Tab 类型 → Vue 组件 的注册表
 *
 * - 静态 TAB_LOADERS：已清空；宿主 Tab 均经 Feature Contract contributes.tabs（A-15-FULL）
 * - resolveWorkspaceTab = 贡献懒加载组件（禁止与静态双定义）
 */
import type {Component} from 'vue'
import type {WorkspaceTabType} from '@/core/types'
import {listFeatureTabContributions} from '@/core/feature-contract'
import {createRegistry, resolveRegistryComponent} from '@/core/registry/create-registry'
import {
    createLazyView,
    prefetchLazyLoaders,
    type LazyViewLoader,
} from '@/core/registry/create-lazy-view'

/** Reserved for emergency static fallbacks — prefer Feature Contract tabs. */
const TAB_LOADERS = {} as const satisfies Record<string, LazyViewLoader>

type RegisteredTabType = keyof typeof TAB_LOADERS

const TAB_ASYNC_NAMES: Partial<Record<RegisteredTabType, string>> = {}

function lazyTab(key: RegisteredTabType, loader: LazyViewLoader) {
    const name = TAB_ASYNC_NAMES[key]
    return createLazyView(loader, name ? {name} : undefined)
}

const definitions = (Object.keys(TAB_LOADERS) as RegisteredTabType[]).map((key) => ({
    key,
    component: lazyTab(key, TAB_LOADERS[key]),
}))

export const WORKSPACE_TAB_REGISTRY = createRegistry(definitions)

const contributionComponentCache = new Map<string, Component>()

/** Test helper — clear lazy contribution wrappers after resetFeatureRegistry. */
export function resetWorkspaceTabContributionCache(): void {
    contributionComponentCache.clear()
}

/**
 * Fail-fast after registerBuiltinFeatures: no static∪contribution or cross-feature duplicates.
 */
export function assertWorkspaceTabContributionsValid(): void {
    const byType = new Map<WorkspaceTabType, number>()
    for (const entry of listFeatureTabContributions()) {
        if (entry.type in TAB_LOADERS) {
            throw new Error(
                `workspace tab type "${entry.type}" is both in TAB_LOADERS and feature contributions`,
            )
        }
        byType.set(entry.type, (byType.get(entry.type) ?? 0) + 1)
    }
    for (const [type, count] of byType) {
        if (count > 1) {
            throw new Error(`workspace tab type "${type}" contributed ${count} times`)
        }
    }
}

/** 启动后空闲预取：覆盖最常打开的工作区页，降低首次打开卡顿与占位闪现 */
export const WORKSPACE_TAB_WARMUP_TYPES: WorkspaceTabType[] = [
    'console',
    'table',
    'connection',
    'create-database',
    'welcome',
    // Project docs / local files — avoid first-open stuck on PanelLoadingShell
    'local-text',
]

export function resolveWorkspaceTab(type: WorkspaceTabType): Component | null {
    const staticHit = resolveRegistryComponent(WORKSPACE_TAB_REGISTRY, type)
    const contributed = listFeatureTabContributions().filter((entry) => entry.type === type)

    if (staticHit && contributed.length > 0) {
        throw new Error(
            `workspace tab type "${type}" is both in TAB_LOADERS and feature contributions`,
        )
    }
    if (contributed.length > 1) {
        throw new Error(`workspace tab type "${type}" contributed ${contributed.length} times`)
    }
    if (staticHit) return staticHit

    const entry = contributed[0]
    if (!entry) return null

    let cached = contributionComponentCache.get(type)
    if (!cached) {
        cached = createLazyView(entry.loader, {
            ...(entry.asyncName ? {name: entry.asyncName} : {}),
            ...(entry.timeout != null ? {timeout: entry.timeout} : {}),
        })
        contributionComponentCache.set(type, cached)
    }
    return cached
}

export function prefetchWorkspaceTabs(
    types: readonly WorkspaceTabType[] = WORKSPACE_TAB_WARMUP_TYPES,
): Promise<void> {
    const loaders: Array<LazyViewLoader | null | undefined> = types.map((type) => {
        if (type in TAB_LOADERS) return TAB_LOADERS[type as RegisteredTabType]
        const entry = listFeatureTabContributions().find((c) => c.type === type)
        return entry?.loader
    })
    return prefetchLazyLoaders(loaders)
}
