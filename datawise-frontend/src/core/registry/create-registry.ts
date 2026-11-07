import type {Component} from 'vue'

export interface RegistryEntry<K extends string> {
    key: K
    component: Component
}

/** 由声明式条目数组构建 key → component 映射，便于扩展新页面 */
export function createRegistry<K extends string>(
    entries: RegistryEntry<K>[],
): Record<K, Component> {
    return Object.fromEntries(entries.map((item) => [item.key, item.component])) as Record<K, Component>
}

export function resolveRegistryComponent<K extends string>(
    registry: Partial<Record<K, Component>>,
    key: K,
): Component | null {
    return registry[key] ?? null
}
