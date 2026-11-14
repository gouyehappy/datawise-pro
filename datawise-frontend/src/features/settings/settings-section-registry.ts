/**
 * 设置页分区 → 面板组件 的注册表（与 tab-registry / module-registry 同模式）
 */
import type {Component} from 'vue'
import type {SettingsSection} from '@/core/types'
import {createRegistry, resolveRegistryComponent} from '@/core/registry/create-registry'
import {
    createLazyView,
    prefetchLazyLoaders,
    type LazyViewLoader,
} from '@/core/registry/create-lazy-view'

const PANEL_LOADERS = {
    basic: () => import('@/features/settings/components/BasicSettingsPanel.vue'),
    layout: () => import('@/features/settings/components/LayoutSettingsPanel.vue'),
    connectionHealth: () => import('@/features/settings/components/ConnectionHealthSettingsPanel.vue'),
    systemMetrics: () => import('@/features/settings/components/SystemMetricsSettingsPanel.vue'),
    runtime: () => import('@/features/settings/components/RuntimeSettingsPanel.vue'),
    profile: () => import('@/features/settings/components/ProfileSettingsPanel.vue'),
    editor: () => import('@/features/settings/components/EditorSettingsPanel.vue'),
    querySafety: () => import('@/features/settings/components/EditorSettingsPanel.vue'),
    sqlEditor: () => import('@/features/settings/components/SqlEditorShortcutsPanel.vue'),
    sqlSnippets: () => import('@/features/settings/components/SqlSnippetsSettingsPanel.vue'),
    shortcuts: () => import('@/features/settings/components/ShortcutSettingsPanel.vue'),
    plugins: () => import('@/features/settings/components/PluginSettingsPanel.vue'),
    ai: () =>
        import.meta.env.VITE_DATAWISE_EDITION === 'standard'
            ? import('@/features/pack/stubs/AiSettingsStub.vue')
            : import('@/features/settings/components/AiSettingsPanel.vue'),
    dataAgent: () =>
        import.meta.env.VITE_DATAWISE_EDITION === 'standard'
            ? import('@/features/pack/stubs/AiSettingsStub.vue')
            : import('@/features/settings/components/AiDataAgentHubPanel.vue'),
    knowledge: () =>
        import.meta.env.VITE_DATAWISE_EDITION === 'standard'
            ? import('@/features/pack/stubs/AiSettingsStub.vue')
            : import('@/features/settings/components/AiDataAgentHubPanel.vue'),
    about: () => import('@/features/settings/components/AboutSettingsPanel.vue'),
    integrations: () => import('@/features/settings/components/IntegrationsSettingsPanel.vue'),
    mcp: () => import('@/features/settings/components/McpSettingsPanel.vue'),
    secrets: () => import('@/features/settings/components/SecretsSettingsPanel.vue'),
    userPermissions: () => import('@/features/settings/components/UserPermissionSettingsPanel.vue'),
    tenants: () => import('@/features/settings/components/TenantsSettingsPanel.vue'),
    projects: () => import('@/features/settings/components/ProjectsSettingsPanel.vue'),
    configPortability: () => import('@/features/settings/components/ConfigPortabilitySettingsPanel.vue'),
    configCloudSync: () => import('@/features/settings/components/ConfigCloudSyncSettingsPanel.vue'),
    backupCenter: () =>
        import.meta.env.VITE_DATAWISE_EDITION === 'standard'
            ? import('@/features/pack/stubs/BackupSettingsStub.vue')
            : import('@/features/settings/components/BackupCenterSettingsPanel.vue'),
} as const satisfies Record<string, LazyViewLoader>

type RegisteredSettingsSection = keyof typeof PANEL_LOADERS

function lazyPanel(loader: LazyViewLoader) {
    return createLazyView(loader)
}

const definitions = (Object.keys(PANEL_LOADERS) as RegisteredSettingsSection[]).map((key) => ({
    key,
    component: lazyPanel(PANEL_LOADERS[key]),
}))

export const SETTINGS_SECTION_REGISTRY = createRegistry(definitions)

export const SETTINGS_PANEL_WARMUP_SECTIONS: SettingsSection[] = [
    'basic',
    'layout',
    'editor',
]

export function resolveSettingsPanel(section: SettingsSection): Component | null {
    return resolveRegistryComponent(SETTINGS_SECTION_REGISTRY, section)
}

export function prefetchSettingsPanels(
    sections: readonly SettingsSection[] = SETTINGS_PANEL_WARMUP_SECTIONS,
): Promise<void> {
    return prefetchLazyLoaders(
        sections.map((section) => PANEL_LOADERS[section as RegisteredSettingsSection]),
    )
}
