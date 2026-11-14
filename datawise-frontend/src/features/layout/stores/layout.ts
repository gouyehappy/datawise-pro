/**
 * Layout 壳层状态：导航模块、面板可见性、用户资料
 *
 * 领域数据已拆至独立 store：
 * - theme-store / notification-store / team-store / plugin-store / shortcut-panel-store / toast-store
 */
import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import type {NavModule, SettingsSection, ShortcutPanel} from '@/core/types'
import {resolveShellSlotForModule, resolveNavModuleContribution} from '@/core/feature-contract'
import {resolveWorkbenchModule} from '@/features/layout/module-registry'
import {t} from '@/i18n'
import {useNotificationStore} from '@/features/layout/stores/notification-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useToastStore} from '@/features/layout/stores/toast-store'
import {useTeamStore} from '@/features/team/stores/team-store'
import {getAppConfigStore} from '@/features/layout/stores/app-config-store-accessor'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {
    canAccessFeature,
    canOpenSettingsSection,
    sideRailFeatureKey,
} from '@/features/auth/services/feature-permission.service'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import type {SideRailItemId} from '@/features/layout/constants/side-rail-nav'
import {tryDispatchNavModuleContribution} from '@/features/layout/services/nav-module-host.service'
import {
    defaultModuleForWorkbenchMode,
    inferWorkbenchModeFromModule,
    type WorkbenchMode,
} from '@/shared/config/workbench-mode'
import {
    notifyExportDone,
    pushAppNotification,
    type AppNotificationPushInput,
} from '@/features/layout/services/app-feedback.service'

/** 系统首页：工作台（database） */
const HOME_NAV_MODULE: NavModule = 'database'

function unresolvedWorkbenchMode(value: unknown): WorkbenchMode | null {
    if (value == null) return null
    if (typeof value === 'string') return value as WorkbenchMode
    if (typeof value === 'object' && value !== null && 'value' in value) {
        const inner = (value as {value: unknown}).value
        return typeof inner === 'string' ? (inner as WorkbenchMode) : null
    }
    return null
}

export const useLayoutStore = defineStore('layout', () => {
    const toast = useToastStore()
    const shortcutPanel = useShortcutPanelStore()
    const teamStore = useTeamStore()

    const settingsSection = ref<SettingsSection>('basic')
    const settingsScrollAnchor = ref<string | null>(null)
    const activeModule = ref<NavModule>('database')
    const activeShortcutPanel = ref<ShortcutPanel | null>(null)
    const showTerminalPanel = ref(false)
    const terminalHeight = ref(240)
    const showNotificationDrawer = ref(false)
    const showAssistantDrawer = ref(false)
    const showProfileMenu = ref(false)

    /** Custom name when set; otherwise follow locale via computed (C8 i18n snapshot fix). */
    const profileNameOverride = ref<string | null>(null)
    const profileEmailOverride = ref<string | null>(null)
    const profileName = computed({
        get: () => profileNameOverride.value ?? t('profile.defaultName'),
        set: (value: string) => {
            profileNameOverride.value = value
        },
    })
    const profileEmail = computed({
        get: () => profileEmailOverride.value ?? 'user@datawise.local',
        set: (value: string) => {
            profileEmailOverride.value = value
        },
    })

    /** A-10: database / ai come from Feature Contract shell-slot contributions. */
    const activeShellSlot = computed(() => resolveShellSlotForModule(activeModule.value))
    const isDatabaseModule = computed(() => activeShellSlot.value === 'database')

    const isWorkbenchModule = computed(() => {
        const module = activeModule.value
        if (resolveShellSlotForModule(module)) return true
        if (resolveNavModuleContribution(module)?.kind === 'workspace-open') return true
        return resolveWorkbenchModule(module) != null
    })

    function canAccessNavModule(module: NavModule): boolean {
        if (module === 'settings') return canAccessFeature(FeaturePermission.NavSettings)
        if (module === 'team') return canAccessFeature(FeaturePermission.NavTeam)
        if (module === 'profile') return canAccessFeature(FeaturePermission.SettingsProfile)
        if (module === 'communityPlugin') return canAccessFeature(FeaturePermission.NavPlugin)
        const sideRailId = module as SideRailItemId
        const feature = sideRailFeatureKey(sideRailId)
        return feature ? canAccessFeature(feature) : true
    }

    function setModule(module: NavModule) {
        if (module === 'profile') {
            openSettingsModule('profile')
            return
        }
        showProfileMenu.value = false
        const navContrib = resolveNavModuleContribution(module)
        if (navContrib && tryDispatchNavModuleContribution(navContrib)) {
            // workspace-open: keep current activeModule (e.g. database shell + center tab)
            return
        }
        activeModule.value = module
        // B0-2: soft-align mode only (no applyLayoutState) — avoids re-entrancy from applyLayoutEffects
        const inferred = inferWorkbenchModeFromModule(module)
        if (inferred) {
            try {
                const appConfig = getAppConfigStore()
                const current = unresolvedWorkbenchMode(appConfig.workbenchMode)
                if (current !== inferred && typeof appConfig.softSetWorkbenchMode === 'function') {
                    appConfig.softSetWorkbenchMode(inferred)
                } else if (current !== inferred && typeof appConfig.setWorkbenchMode === 'function') {
                    // Older store shapes: still avoid crashing boot
                    appConfig.setWorkbenchMode(inferred)
                }
            } catch {
                // Store mid-init during hydrate — mode will catch up on next layout apply
            }
        }
    }

    /** B0-3: switch mode, persist, and jump to the mode's default module when accessible */
    function setWorkbenchMode(mode: WorkbenchMode) {
        const appConfig = getAppConfigStore()
        if (typeof appConfig.setWorkbenchMode === 'function') {
            appConfig.setWorkbenchMode(mode)
        } else if (typeof appConfig.softSetWorkbenchMode === 'function') {
            appConfig.softSetWorkbenchMode(mode)
        }
        const target = defaultModuleForWorkbenchMode(mode) as NavModule
        if (!canAccessNavModule(target)) {
            if (canAccessNavModule(HOME_NAV_MODULE) && activeModule.value !== HOME_NAV_MODULE) {
                activeModule.value = HOME_NAV_MODULE
            }
            return
        }
        if (activeModule.value === target) {
            if (target === 'database' && appConfig.showExplorerPanel === false) {
                appConfig.setShowExplorerPanel?.(true)
            }
            return
        }
        showProfileMenu.value = false
        if (target === 'ai') {
            if (!useEntitlementStore().guardAiNav()) return
            activeModule.value = 'ai'
            return
        }
        if (target === 'team') {
            openTeamModule()
            return
        }
        activeModule.value = target
        if (target === 'database' && !appConfig.showExplorerPanel) {
            appConfig.setShowExplorerPanel(true)
        }
    }

    function openSettingsModule(section: SettingsSection = 'basic', anchor?: string) {
        if (!canOpenSettingsSection(section)) return
        if (section === 'backupCenter' && !useEntitlementStore().guardPack('pack.backup', 'settings.backup')) {
            return
        }
        showProfileMenu.value = false
        settingsSection.value = section
        settingsScrollAnchor.value = anchor ?? null
        activeModule.value = 'settings'
    }

    function clearSettingsScrollAnchor() {
        settingsScrollAnchor.value = null
    }

    function setSettingsSection(section: SettingsSection) {
        settingsSection.value = section
    }

    function toggleProfileMenu() {
        showProfileMenu.value = !showProfileMenu.value
    }

    function closeProfileMenu() {
        showProfileMenu.value = false
    }

    function openTeamModule() {
        if (!canAccessFeature(FeaturePermission.NavTeam)) return
        showProfileMenu.value = false
        activeModule.value = 'team'
    }

    function createTeam(name: string) {
        void teamStore.createTeam(name)
    }

    function joinTeam(code: string) {
        void teamStore.joinTeam(code)
    }

    function toggleShortcutPanel(panel: ShortcutPanel) {
        showNotificationDrawer.value = false
        showAssistantDrawer.value = false
        activeShortcutPanel.value = activeShortcutPanel.value === panel ? null : panel
    }

    function toggleNotificationDrawer() {
        activeShortcutPanel.value = null
        showAssistantDrawer.value = false
        showNotificationDrawer.value = !showNotificationDrawer.value
    }

    function toggleAssistantDrawer() {
        activeShortcutPanel.value = null
        showNotificationDrawer.value = false
        showAssistantDrawer.value = !showAssistantDrawer.value
    }

    function toggleTerminalPanel() {
        showTerminalPanel.value = !showTerminalPanel.value
    }

    function closeTerminalPanel() {
        showTerminalPanel.value = false
    }

    function setTerminalHeight(height: number) {
        terminalHeight.value = Math.min(520, Math.max(160, height))
    }

    function showToast(
        message: string,
        options?: {
            variant?: 'info' | 'success' | 'warning' | 'error'
            durationMs?: number
            action?: {label: string; onClick: () => void}
        },
    ) {
        if (options) {
            toast.show(message, options)
            return
        }
        toast.show(message)
    }

    function showSuccessToast(message: string) {
        toast.showSuccess(message)
    }

    function showWarningToast(message: string) {
        toast.showWarning(message)
    }

    function showErrorToast(message: string) {
        toast.showError(message)
    }

    function globalRefresh() {
        // 刷新后树与工作区 UI 自行更新，无需 Toast
    }

    function startExport(fileName: string, _path?: string) {
        // 导出完成进通知抽屉，避免长任务结束再抢焦点弹 toast。
        shortcutPanel.addExportTask(fileName, () => {
            void notifyExportDone(fileName)
        })
        activeShortcutPanel.value = 'export'
    }

    /** 写入通知抽屉（不弹 toast）。 */
    function notifyQuiet(input: AppNotificationPushInput) {
        void pushAppNotification(input)
    }

    /**
     * 权限变更后校正当前模块（仅在 auth 会话就绪后调用，勿在 app-config store 初始化链路中调用）。
     */
    function ensureAccessibleModule() {
        if (activeModule.value === 'settings') {
            if (canOpenSettingsSection(settingsSection.value)) return
        } else if (activeModule.value === 'team' && canAccessNavModule('team')) {
            return
        } else if (canAccessNavModule(activeModule.value)) {
            return
        }

        activeModule.value = getAppConfigStore().pickAccessibleModule()
        if (!canAccessNavModule(activeModule.value)) {
            activeModule.value = HOME_NAV_MODULE
        }
    }

    function updateProfile(name: string, email: string) {
        profileNameOverride.value = name
        profileEmailOverride.value = email
        // 资料页已展示当前值，无需再 toast。
    }

    return {
        settingsSection,
        settingsScrollAnchor,
        activeModule,
        activeShortcutPanel,
        showTerminalPanel,
        terminalHeight,
        showNotificationDrawer,
        showAssistantDrawer,
        showProfileMenu,
        profileName,
        profileEmail,
        activeShellSlot,
        isDatabaseModule,
        isWorkbenchModule,
        canAccessNavModule,
        setModule,
        setWorkbenchMode,
        openSettingsModule,
        clearSettingsScrollAnchor,
        setSettingsSection,
        toggleProfileMenu,
        closeProfileMenu,
        openTeamModule,
        createTeam,
        joinTeam,
        toggleShortcutPanel,
        toggleNotificationDrawer,
        toggleAssistantDrawer,
        toggleTerminalPanel,
        closeTerminalPanel,
        setTerminalHeight,
        showToast,
        showSuccessToast,
        showWarningToast,
        showErrorToast,
        notifyQuiet,
        globalRefresh,
        startExport,
        updateProfile,
        ensureAccessibleModule,
    }
})

/** 便捷组合：壳层 + 通知未读数（侧栏角标等） */
export function useLayoutShell() {
    const layout = useLayoutStore()
    const notifications = useNotificationStore()
    return {layout, notifications}
}
