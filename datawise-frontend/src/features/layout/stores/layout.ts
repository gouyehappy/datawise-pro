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
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {canAccessFeature, sideRailFeatureKey} from '@/features/auth/services/feature-permission.service'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import type {SideRailItemId} from '@/features/layout/constants/side-rail-nav'
import {tryDispatchNavModuleContribution} from '@/features/layout/services/nav-module-host.service'

/** 系统首页：工作台（database） */
const HOME_NAV_MODULE: NavModule = 'database'

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

    const profileName = ref(t('profile.defaultName'))
    const profileEmail = ref('user@datawise.local')

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
    }

    function openSettingsModule(section: SettingsSection = 'basic', anchor?: string) {
        const appConfig = useAppConfigStore()
        if (!appConfig.canOpenSettingsSection(section)) return
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

    function startExport(fileName: string, path?: string) {
        shortcutPanel.addExportTask(fileName, () => {
            toast.showSuccess(
                path
                    ? t('toast.exportCompletePath', {name: fileName, path})
                    : t('toast.exportComplete', {name: fileName}),
            )
        })
        activeShortcutPanel.value = 'export'
    }

    /**
     * 权限变更后校正当前模块（仅在 auth 会话就绪后调用，勿在 app-config store 初始化链路中调用）。
     */
    function ensureAccessibleModule() {
        const appConfig = useAppConfigStore()

        if (activeModule.value === 'settings') {
            if (appConfig.canOpenSettingsSection(settingsSection.value)) return
        } else if (activeModule.value === 'team' && canAccessNavModule('team')) {
            return
        } else if (canAccessNavModule(activeModule.value)) {
            return
        }

        activeModule.value = appConfig.pickAccessibleModule()
        if (!canAccessNavModule(activeModule.value)) {
            activeModule.value = HOME_NAV_MODULE
        }
    }

    function updateProfile(name: string, email: string) {
        profileName.value = name
        profileEmail.value = email
        toast.showSuccess(t('toast.profileUpdated'))
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
