<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {buildTitleBarNav, type TitleBarMenuItem} from '@/features/layout/services/title-bar-nav.service'
import TitleBarMenuIcon from '@/features/layout/components/TitleBarMenuIcon.vue'
import {DwIcon} from '@/core/icons'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import CommunityPluginIcon from '@/features/community-plugin/components/CommunityPluginIcon.vue'
import TreeNodeIcon from '@/features/explorer/components/TreeNodeIcon.vue'
import type {DwIconName} from '@/core/icons'
import {openWelcomeConnectionPrimary} from '@/features/workspace/services/welcome-open-connection-action.service'
import {useTitleBarMenuDensity} from '@/features/layout/composables/useTitleBarMenuDensity'
import {beginFramelessWindowDrag} from '@/features/layout/composables/useDesktopTitleBar'
import {useGlobalObjectSearch} from '@/features/layout/composables/useGlobalObjectSearch'
import {useOnboardingStore} from '@/features/onboarding/stores/onboarding-store'
import {
    canOpenConnectionCatalogForm,
    getActiveFeaturePermissions,
} from '@/features/auth/services/feature-permission.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useProjectStore} from '@/features/project/stores/project'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useUpdateSettingsStore} from '@/features/settings/stores/update-settings'
import {openUrl} from '@/shared/browser/open-url'
import DbTypeContextPanel from '@/features/explorer/components/DbTypeContextPanel.vue'
import type {DbType} from '@/core/types'
import {runExplorerRefresh} from '@/features/explorer/services/explorer-toolbar.actions'
import {canOpenRuntimeLog, openRuntimeLog} from '@/features/layout/services/open-runtime-log.service'
import {
    canToggleDesktopDevTools,
    toggleDesktopDevTools,
} from '@/features/layout/services/desktop-devtools.service'
import {
    canPickSqlFile,
    canRevealInExplorer,
    pickAndOpenSqlFile,
    revealPathInExplorer,
} from '@/features/layout/services/desktop-file-open.service'
import {
    canDesktopZoom,
    desktopZoomIn,
    desktopZoomOut,
    desktopZoomReset,
} from '@/features/layout/services/desktop-zoom.service'
import {useTitleBarPreferenceMenuItems} from '@/features/layout/composables/useProfileMenuGroups'
import {useWorkspaceActions} from '@/features/layout/composables/useWorkspaceActions'
import type {TitleBarMenuIconId} from '@/features/layout/components/TitleBarMenuIcon.vue'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'

const GITHUB_REPO_SLUG =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim() || 'gouyehappy/datawise-cli'
const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO_SLUG}`

const {t, te} = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const explorer = useExplorerStore()
const projectStore = useProjectStore()
const catalog = useDatasourceCatalogStore()
const auth = useAuthStore()
const appConfig = useAppConfigStore()
const entitlement = useEntitlementStore()
const onboarding = useOnboardingStore()
const updateSettings = useUpdateSettingsStore()
const {openGlobalObjectSearch} = useGlobalObjectSearch()
const {
    showSideRailStrip,
    showExplorerPanel,
    showShortcutRailStrip,
} = storeToRefs(appConfig)

function setModuleGuarded(module: Parameters<typeof layout.setModule>[0]): void {
    if (module === 'ai' && !entitlement.guardAiNav()) return
    layout.setModule(module)
}

function toggleSideRailStrip() {
    appConfig.setShowSideRailStrip(!appConfig.showSideRailStrip)
}

function toggleExplorerPanel() {
    const next = !appConfig.showExplorerPanel
    appConfig.setShowExplorerPanel(next)
    if (next && layout.activeModule !== 'database' && layout.activeModule !== 'ai') {
        layout.showWarningToast(t('app.titleBar.menu.configQuick.explorerOnlyInWorkbench'))
    }
}

function toggleShortcutRailStrip() {
    const dock = useDockPlacementStore()
    if (appConfig.showShortcutRailStrip && dock.shortcutSide === 'float') {
        appConfig.setDockPlacement({...dock.placement, shortcut: 'right'})
        return
    }
    const next = !appConfig.showShortcutRailStrip
    appConfig.setShowShortcutRailStrip(next)
    if (next && !appConfig.showShortcutRail) {
        layout.showWarningToast(t('app.titleBar.menu.configQuick.rightSidebarEmpty'))
    }
}

/** Run after the dropdown unmounts so JCEF/Vue don't double-fire on a patched checkbox row. */
function runConfigAction(id: string, fallback?: () => void) {
    switch (id) {
        case 'config:side-rail':
            toggleSideRailStrip()
            return
        case 'config:explorer':
            toggleExplorerPanel()
            return
        case 'config:shortcut-rail':
            toggleShortcutRailStrip()
            return
        case 'config:focus-mode':
            appConfig.applyFocusMode()
            return
        default:
            fallback?.()
    }
}

function openNewConnectionPicker() {
    if (!canOpenConnectionCatalogForm(auth.isGuest)) {
        layout.showErrorToast(t('auth.permissionDenied'))
        return
    }
    layout.setModule('database')
    void catalog.ensureLoaded().catch(() => undefined)
}

function openNewConsole() {
    layout.setModule('database')
    workspace.openConsole()
}

/**
 * 原本散在顶栏右侧的 6 个快捷图标（更新 / 主题 / 锁屏 / AI / GitHub / 设置）
 * 与汉堡主菜单、「⋯」配置菜单高度重复。现在只保留外观 + 设置两个常驻图标，
 * 其余动作归入「⋯」的三个语义分组，功能一个不丢、入口不再重复。
 */
async function checkUpdate() {
    try {
        const result = await updateSettings.runUpdateCheck()
        if (result?.hasUpdate) {
            layout.openSettingsModule('about')
            layout.notifyQuiet({
                category: 'system',
                titleKey: 'updateAvailable',
                bodyKey: 'updateAvailable',
                params: {version: result.latestVersion || ''},
            })
            return
        }
        // 已是最新：关于页可看，不必弹 toast。
    } catch {
        layout.openSettingsModule('about')
        layout.showWarningToast(t('app.titleBar.quick.updateFailed'))
    }
}

const menus = computed(() => {
    getActiveFeaturePermissions()
    return buildTitleBarNav(
        {
            activeModule: layout.activeModule,
            settingsSection: layout.settingsSection,
            communityPluginCenterActive: workspace.activeTab?.type === 'community-plugin-center',
            config: {
                showSideRailStrip: showSideRailStrip.value,
                showExplorerPanel: showExplorerPanel.value,
                showShortcutRailStrip: showShortcutRailStrip.value,
            },
        },
        {
            setModule: setModuleGuarded,
            openSettings: (section) => layout.openSettingsModule(section ?? 'basic'),
            openOnboarding: () => onboarding.showGuide('default'),
            openRuntimeSetup: () => onboarding.showRuntimeSetup(),
            openNewConnection: openNewConnectionPicker,
            openNewConsole,
            config: {
                openPreferences: () => layout.openSettingsModule('basic'),
                toggleSideRailStrip,
                toggleExplorerPanel,
                toggleShortcutRailStrip,
                applyFocusMode: () => appConfig.applyFocusMode(),
            },
        },
    )
})

function labelOf(item: TitleBarMenuItem): string {
    if (!item.labelKey) return ''
    return te(item.labelKey) ? t(item.labelKey) : item.labelKey
}

/**
 * 上下文 widget（IDEA 的 VCS widget 位置）：顶栏常驻「当前连接 / 库」。
 * 点开只看状态（项目 / 连接 / 库 / 表），成功反馈以此自证，不叠 toast。
 */
const contextInfo = computed(() => {
    const tab = workspace.activeTab
    const connectionId = tab?.connectionId?.trim() ?? ''
    const project = projectStore.displayName?.trim() || t('app.titleBar.projectSwitcher.default')
    const needsReconnect = Boolean(
        connectionId && explorer.connectionNeedsReconnect(connectionId),
    )
    if (!connectionId) {
        return {
            connected: false,
            needsReconnect: false,
            connectionId: '',
            label: t('app.titleBar.menu.contextIdle'),
            project,
            connection: '',
            database: '',
            table: '',
            dbType: '',
            pluginId: '',
        }
    }
    const node = explorer.findNode(connectionId)
    const connection = node?.label ?? connectionId
    const database = tab?.database ?? ''
    const dbType = (node?.dbType || tab?.dbType || '').trim()
    const pluginId = (node?.pluginId || tab?.pluginId || '').trim()
    return {
        connected: true,
        needsReconnect,
        connectionId,
        label: database ? `${connection} / ${database}` : connection,
        project,
        connection,
        database,
        table: tab?.tableName ?? '',
        dbType,
        pluginId,
    }
})

/** 连接池中的在线资源，供上下文卡切换。 */
const contextPooledResources = computed(() => {
    const activeId = contextInfo.value.connectionId
    const rows = [...explorer.pooledConnectionIds].map((id) => {
        const node = explorer.findNode(id)
        const envRaw = (node?.envCustom || node?.env || '').trim()
        return {
            id,
            label: node?.label?.trim() || id,
            dbType: (node?.dbType || '') as DbType,
            pluginId: node?.pluginId?.trim() || '',
            env: envRaw && envRaw.toLowerCase() !== 'none' ? envRaw : '',
        }
    })
    rows.sort((a, b) => {
        if (a.id === activeId) return -1
        if (b.id === activeId) return 1
        return a.label.localeCompare(b.label, undefined, {sensitivity: 'base'})
    })
    return rows
})

function onPickContextResource(row: {
    id: string
    label: string
    dbType: DbType
}) {
    if (row.id === contextInfo.value.connectionId) {
        closeAll()
        return
    }
    closeAll()
    explorer.selectNode(row.id)
    if (!row.dbType) {
        void explorer.connectConnection(row.id, {notify: true})
        return
    }
    void openWelcomeConnectionPrimary({
        connectionId: row.id,
        connectionName: row.label,
        dbType: row.dbType,
    })
}

/** 与资源树 TreeNodeIcon 一致：社区插件走插件图标，否则走数据源品牌图标。 */
const contextPluginFallback = computed<DwIconName>(() =>
    contextInfo.value.dbType === 'ssh' ? 'terminal' : 'plugins',
)

/** 点开上下文卡时懒加载：host / 用户 / 环境（不含密码）。 */
const contextEndpoint = ref('')
const contextUser = ref('')
const contextEnv = ref('')
let contextDetailSeq = 0

function resetContextConnectionDetail() {
    contextEndpoint.value = ''
    contextUser.value = ''
    contextEnv.value = ''
}

function formatContextEndpoint(host: string, port: string): string {
    const h = host.trim()
    const p = port.trim()
    if (!h) return ''
    return p ? `${h}:${p}` : h
}

async function loadContextConnectionDetail(connectionId: string) {
    const seq = ++contextDetailSeq
    resetContextConnectionDetail()
    if (!connectionId) return
    const config = await fetchConnectionConfig(connectionId)
    if (seq !== contextDetailSeq) return
    if (!config) return
    const endpoint = formatContextEndpoint(config.host || '', config.port || '')
        || config.url?.trim()
        || ''
    contextEndpoint.value = endpoint
    contextUser.value = (config.user || config.sshUser || '').trim()
    const env = (config.envCustom || config.env || '').trim()
    contextEnv.value = env && env.toLowerCase() !== 'none' ? env : ''
}

/** 无选中数据源时顶栏不占位，有连接/库上下文才显示 */
const showContextWidget = computed(() => contextInfo.value.connected)

/** Widget 面板：context = 只读上下文卡；create = 新建；more = 导航 / 界面 / 系统 */
type WidgetPanel = 'context' | 'create' | 'more'
type PanelAlign = 'left' | 'right'

interface PanelGroup {
    id: string
    label?: string
    icon?: TitleBarMenuIconId
    items: TitleBarMenuItem[]
}

/** 「更多」一级行：常用叶子 / 分隔 / 仅次常用收二级 */
type MoreMenuRow =
    | {kind: 'leaf'; item: TitleBarMenuItem}
    | {kind: 'divider'; id: string}
    | {kind: 'submenu'; id: string; label: string; icon: TitleBarMenuIconId; items: TitleBarMenuItem[]}

const openPanel = ref<WidgetPanel | null>(null)
/** 「更多」悬停展开的二级分组 */
const openFlyoutId = ref<string | null>(null)
let flyoutCloseTimer: ReturnType<typeof setTimeout> | null = null

watch(showContextWidget, (visible) => {
    if (!visible && openPanel.value === 'context') {
        openPanel.value = null
    }
})

watch(
    () => [openPanel.value, workspace.activeTab?.connectionId] as const,
    ([panel, connectionId]) => {
        if (panel !== 'context') {
            contextDetailSeq += 1
            resetContextConnectionDetail()
            return
        }
        void loadContextConnectionDetail(connectionId?.trim() || '')
    },
)

const pickerOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const dropdownPlacement = ref<{top: number; left: number; right: number; align: PanelAlign} | null>(null)

const createItems = computed(() => menus.value.filter((item) => item.group === 'create'))
const browseItems = computed(() => menus.value.filter((item) => item.group === 'browse'))
const configChildren = computed(() => menus.value.find((item) => item.id === 'config')?.children ?? [])

/** 首选项已由常驻齿轮 + 汉堡主菜单承担，这里不再列第三遍 */
const interfaceItems = computed(() =>
    configChildren.value.filter((item) => item.id !== 'config:preferences'),
)

/** AI 与连接器 / 社区插件同属模块导航，权限不足时不显示 */
const browseEntries = computed<TitleBarMenuItem[]>(() => {
    const entries = [...browseItems.value]
    if (layout.canAccessNavModule('ai')) {
        entries.push({
            id: 'nav:ai',
            labelKey: 'app.titleBar.quick.ai',
            icon: 'ai',
            active: layout.activeModule === 'ai',
            run: () => setModuleGuarded('ai'),
        })
    }
    return entries
})

/** 一级常用：检查更新 / 关于 */
const systemPrimaryItems = computed<TitleBarMenuItem[]>(() => [
    {
        id: 'sys:update',
        labelKey: 'app.titleBar.quick.update',
        icon: 'refresh',
        run: () => void checkUpdate(),
    },
    {
        id: 'sys:about',
        labelKey: 'app.titleBar.menu.settingsAbout',
        icon: 'about',
        active: layout.activeModule === 'settings' && layout.settingsSection === 'about',
        run: () => layout.openSettingsModule('about'),
    },
])

const {resolvedPath, activeEntry} = useWorkspaceActions()

/** 汉堡主菜单收掉的次常用项：引导 / 运行时 / 刷新树 */
const secondaryPreferenceItems = useTitleBarPreferenceMenuItems(
    () => {},
    () => { void runExplorerRefresh() },
    {tier: 'secondary'},
)

function preferenceIconToTitleBar(icon: string): TitleBarMenuItem['icon'] {
    if (icon === 'settings-basic') return 'settingsBasic'
    if (icon === 'user') return 'user'
    if (icon === 'tour') return 'tour'
    if (icon === 'connectors') return 'connectors'
    if (icon === 'refresh') return 'refresh'
    return 'tools'
}

function actionableItems(items: TitleBarMenuItem[]): TitleBarMenuItem[] {
    return items.filter(
        (item) => item.kind !== 'header' && !item.divider && (item.run || item.id.startsWith('config:')),
    )
}

/** 次常用：引导 / 运行时 / 刷新 / 文件 / 缩放 / 诊断 / GitHub → 二级「工具」 */
const toolsItems = computed<TitleBarMenuItem[]>(() => {
    const items: TitleBarMenuItem[] = secondaryPreferenceItems.value.map((item) => ({
        id: `tool:${item.id}`,
        labelKey: item.labelKey,
        icon: preferenceIconToTitleBar(item.icon),
        run: () => item.onClick(),
    }))
    if (canPickSqlFile()) {
        items.push({
            id: 'tool:open-sql',
            labelKey: 'app.desktopHost.openSqlFile',
            icon: 'sqlFile',
            run: () => { void pickAndOpenSqlFile() },
        })
    }
    if (canRevealInExplorer()) {
        items.push({
            id: 'tool:reveal-workspace',
            labelKey: 'app.desktopHost.revealWorkspace',
            icon: 'open',
            run: () => {
                const path = resolvedPath.value || activeEntry()?.path
                if (path) void revealPathInExplorer(path)
            },
        })
    }
    if (canDesktopZoom()) {
        items.push(
            {
                id: 'tool:zoom-in',
                labelKey: 'app.desktopHost.zoomIn',
                icon: 'zoomIn',
                run: () => { void desktopZoomIn() },
            },
            {
                id: 'tool:zoom-out',
                labelKey: 'app.desktopHost.zoomOut',
                icon: 'zoomOut',
                run: () => { void desktopZoomOut() },
            },
            {
                id: 'tool:zoom-reset',
                labelKey: 'app.desktopHost.zoomReset',
                icon: 'zoomReset',
                run: () => { void desktopZoomReset() },
            },
        )
    }
    if (canToggleDesktopDevTools()) {
        items.push({
            id: 'tool:devtools',
            labelKey: 'app.titleBar.menu.openDevTools',
            icon: 'devTools',
            run: () => { void toggleDesktopDevTools() },
        })
    }
    if (canOpenRuntimeLog()) {
        items.push({
            id: 'tool:runtime-log',
            labelKey: 'app.titleBar.menu.openRuntimeLog',
            icon: 'runtimeLog',
            run: () => { void openRuntimeLog() },
        })
    }
    items.push({
        id: 'sys:github',
        labelKey: 'app.titleBar.quick.github',
        icon: 'github',
        run: () => void openUrl(GITHUB_REPO_URL),
    })
    return items
})

/**
 * 「更多」混合菜单（IDEA 习惯）：
 * 一级 — 导航入口、界面开关、更新/关于
 * 二级 — 仅「工具」收纳低频项
 */
const moreMenuRows = computed<MoreMenuRow[]>(() => {
    const rows: MoreMenuRow[] = []
    const pushLeaves = (items: TitleBarMenuItem[]) => {
        for (const item of actionableItems(items)) {
            rows.push({kind: 'leaf', item})
        }
    }
    const pushDivider = (id: string) => {
        if (rows.length === 0 || rows[rows.length - 1]?.kind === 'divider') return
        rows.push({kind: 'divider', id})
    }

    pushLeaves(browseEntries.value)
    pushDivider('more:div-interface')
    pushLeaves(interfaceItems.value)
    pushDivider('more:div-system')
    pushLeaves(systemPrimaryItems.value)

    const tools = actionableItems(toolsItems.value)
    if (tools.length) {
        pushDivider('more:div-tools')
        rows.push({
            kind: 'submenu',
            id: 'tools',
            label: t('app.titleBar.menu.toolsGroup'),
            icon: 'tools',
            items: tools,
        })
    }

    while (rows.length && rows[rows.length - 1]?.kind === 'divider') rows.pop()
    return rows
})

/** 「新建」仍是一级扁平列表 */
const panelGroups = computed<PanelGroup[]>(() => {
    if (openPanel.value !== 'create') return []
    return [{id: 'create', items: createItems.value}]
})

const moreUsesFlyout = computed(() => openPanel.value === 'more')

const menuLayoutStats = computed(() => ({
    primaryCount: 2,
    contextItemCount: 0,
    contextGroupCount: 0,
}))
const remeasureKey = computed(() => layout.activeModule)
const {density} = useTitleBarMenuDensity(rootRef, contentRef, menuLayoutStats, remeasureKey)

const dropdownStyle = computed(() => {
    const placement = dropdownPlacement.value
    if (!placement) return undefined
    const top = `${placement.top}px`
    if (pickerOpen.value) {
        const width = Math.min(560, window.innerWidth * 0.92)
        const left = Math.max(8, Math.min(placement.left, window.innerWidth - width - 8))
        return {top, left: `${left}px`}
    }
    // 右对齐锚点（更多 / 新建）：贴触发按钮右缘，避免按假宽度 272 往左推开
    if (placement.align === 'right') {
        return {
            top,
            right: `${Math.max(8, window.innerWidth - placement.right)}px`,
            left: 'auto',
        }
    }
    return {top, left: `${Math.max(8, placement.left)}px`}
})

/** 可见性开关：IDEA 式 gutter 勾选（开=✓，关=空），不用业务图标冒充未选态 */
function isToggleItem(item: TitleBarMenuItem): boolean {
    return typeof item.checked === 'boolean'
}

function clearFlyoutCloseTimer() {
    if (!flyoutCloseTimer) return
    clearTimeout(flyoutCloseTimer)
    flyoutCloseTimer = null
}

function openFlyout(id: string) {
    clearFlyoutCloseTimer()
    openFlyoutId.value = id
}

function scheduleCloseFlyout() {
    clearFlyoutCloseTimer()
    flyoutCloseTimer = setTimeout(() => {
        openFlyoutId.value = null
        flyoutCloseTimer = null
    }, 220)
}

function closeAll() {
    openPanel.value = null
    pickerOpen.value = false
    dropdownPlacement.value = null
    openFlyoutId.value = null
    clearFlyoutCloseTimer()
}

function setDropdownPlacement(button: HTMLElement, align: PanelAlign) {
    const rect = button.getBoundingClientRect()
    dropdownPlacement.value = {top: rect.bottom + 2, left: rect.left, right: rect.right, align}
}

function openCommandPalette() {
    closeAll()
    openGlobalObjectSearch()
}

function onRunQuery() {
    closeAll()
    openNewConsole()
}

function togglePanel(panel: WidgetPanel, event: MouseEvent, align: PanelAlign = 'right') {
    if (openPanel.value === panel && !pickerOpen.value) {
        closeAll()
        return
    }
    pickerOpen.value = false
    openFlyoutId.value = null
    openPanel.value = panel
    setDropdownPlacement(event.currentTarget as HTMLElement, align)
}

function onSelectItem(item: TitleBarMenuItem) {
    const id = item.id
    if (id === 'new-connection') {
        // 沿用旧版行为：先切到数据库模块，再从同一锚点展开数据库类型选择器
        const placement = dropdownPlacement.value
        openPanel.value = null
        item.run?.()
        dropdownPlacement.value = placement
        pickerOpen.value = true
        return
    }
    try {
        if (id.startsWith('config:')) runConfigAction(id, item.run)
        else item.run?.()
    } finally {
        closeAll()
    }
}

function onPickDbType(dbType: DbType) {
    closeAll()
    workspace.openConnectionForm(dbType)
}

usePopoverEscape(
    () => openPanel.value !== null || pickerOpen.value,
    () => closeAll(),
    {closeOnOutside: false},
)

function onDocumentMouseDown(event: MouseEvent) {
    if (!openPanel.value && !pickerOpen.value) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.titlebar-widgets__panel')) return
    if (rootRef.value?.contains(target)) return
    closeAll()
}

function onWindowResize() {
    if (openPanel.value || pickerOpen.value) closeAll()
}

onMounted(() => {
    document.addEventListener('mousedown', onDocumentMouseDown)
    window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
    document.removeEventListener('mousedown', onDocumentMouseDown)
    window.removeEventListener('resize', onWindowResize)
    clearFlyoutCloseTimer()
})
</script>

<template>
  <nav
      ref="rootRef"
      class="titlebar-widgets"
      :class="`titlebar-widgets--${density}`"
      :aria-label="t('app.titleBar.menu.label')"
  >
    <!-- 上下文 widget：有选中连接/库才显示；空闲「未选择」不占顶栏 -->
    <button
        v-if="showContextWidget"
        type="button"
        class="tw-context"
        :class="{'is-open': openPanel === 'context'}"
        :aria-expanded="openPanel === 'context'"
        :title="contextInfo.label"
        @click="togglePanel('context', $event, 'left')"
    >
      <span
          class="tw-context__type"
          :class="{'is-warn': contextInfo.needsReconnect}"
          aria-hidden="true"
      >
        <CommunityPluginIcon
            v-if="contextInfo.pluginId"
            :plugin-id="contextInfo.pluginId"
            :fallback="contextPluginFallback"
            size="sm"
        />
        <DbTypeIcon
            v-else-if="contextInfo.dbType"
            :db-type="contextInfo.dbType"
            :size="18"
        />
        <DwIcon
            v-else
            class="tw-context__icon-fallback"
            name="connection"
            size="sm"
            :stroke-width="1.7"
        />
      </span>
      <span class="tw-context__label">{{ contextInfo.label }}</span>
      <DwIcon class="tw-context__caret" name="chevron-down" size="xs" :stroke-width="1.7"/>
    </button>

    <!-- 大留白只做拖窗区：IDEA 明确靠空白分组，不加分隔线 -->
    <div
        class="tw-spacer"
        aria-hidden="true"
        @pointerdown="beginFramelessWindowDrag"
        @dblclick="$emit('dblclick-drag')"
    />

    <div ref="contentRef" class="tw-right">
      <!--
        Run widget：IDEA 的做法是中性色的线框三角 + 文字配置，
        不用主题色实心块；整行靠「图标略大」而不是「颜色更艳」表达层级。
      -->
      <div class="tw-run">
        <button
            type="button"
            class="tw-run__main"
            :title="t('app.titleBar.menu.newConsole')"
            @click="onRunQuery"
        >
          <DwIcon class="tw-run__glyph" name="run" size="md" :stroke-width="1.8"/>
          <span class="tw-run__label">{{ t('app.titleBar.menu.newConsole') }}</span>
        </button>
        <button
            type="button"
            class="tw-run__caret"
            :class="{'is-open': openPanel === 'create'}"
            :aria-expanded="openPanel === 'create'"
            :title="t('app.titleBar.menu.newGroup')"
            :aria-label="t('app.titleBar.menu.newGroup')"
            @click="togglePanel('create', $event)"
        >
          <DwIcon name="chevron-down" size="xs" :stroke-width="1.7"/>
        </button>
      </div>

      <!-- 通用图标：Search Everywhere + 更多功能组 -->
      <button
          type="button"
          class="tw-icon"
          :title="t('app.titleBar.menu.commandAria')"
          :aria-label="t('app.titleBar.menu.commandAria')"
          @click="openCommandPalette"
      >
        <DwIcon name="search" size="md" :stroke-width="1.8"/>
      </button>
      <button
          type="button"
          class="tw-icon"
          :class="{'is-open': openPanel === 'more'}"
          :aria-expanded="openPanel === 'more'"
          :title="t('app.titleBar.menu.more')"
          :aria-label="t('app.titleBar.menu.more')"
          @click="togglePanel('more', $event)"
      >
        <span class="tw-icon__dots" aria-hidden="true"><i/><i/><i/></span>
      </button>
    </div>

    <Teleport to="body">
      <Transition name="titlebar-dropdown">
        <div
            v-if="pickerOpen"
            class="titlebar-widgets__panel titlebar-widgets__panel--picker"
            :style="dropdownStyle"
            role="menu"
            @mousedown.stop
            @pointerdown.stop
        >
          <div class="titlebar-widgets__panel-head">{{ t('app.titleBar.menu.pickDbType') }}</div>
          <DbTypeContextPanel @select="onPickDbType"/>
        </div>
      </Transition>
      <Transition name="titlebar-dropdown">
        <div
            v-if="openPanel"
            :key="openPanel"
            class="titlebar-widgets__panel"
            :class="{
              'titlebar-widgets__panel--context': openPanel === 'context',
              'titlebar-widgets__panel--flyout': moreUsesFlyout,
            }"
            :style="dropdownStyle"
            role="menu"
            @mousedown.stop
            @pointerdown.stop
        >
          <div v-if="openPanel === 'context'" class="tw-context-card">
            <div class="tw-context-card__head">
              <span class="tw-context-card__title">{{ t('app.titleBar.menu.contextTitle') }}</span>
              <span
                  v-if="contextInfo.connected && !contextInfo.needsReconnect"
                  class="tw-context-card__badge"
              >{{ t('app.titleBar.menu.contextLive') }}</span>
              <span
                  v-else-if="contextInfo.needsReconnect"
                  class="tw-context-card__badge is-warn"
              >{{ t('app.titleBar.menu.contextNeedsReconnect') }}</span>
            </div>
            <div class="tw-context-card__body">
              <div class="tw-context-card__row">
                <span class="tw-context-card__key">{{ t('app.titleBar.menu.contextProject') }}</span>
                <span class="tw-context-card__val" :title="contextInfo.project">{{ contextInfo.project }}</span>
              </div>
              <template v-if="contextInfo.connected">
                <div class="tw-context-card__row">
                  <span class="tw-context-card__key">{{ t('app.titleBar.menu.contextConnection') }}</span>
                  <span class="tw-context-card__val" :title="contextInfo.connection">{{ contextInfo.connection }}</span>
                </div>
                <div v-if="contextEndpoint" class="tw-context-card__row">
                  <span class="tw-context-card__key">{{ t('app.titleBar.menu.contextHost') }}</span>
                  <span class="tw-context-card__val" :title="contextEndpoint">{{ contextEndpoint }}</span>
                </div>
                <div v-if="contextUser" class="tw-context-card__row">
                  <span class="tw-context-card__key">{{ t('app.titleBar.menu.contextUser') }}</span>
                  <span class="tw-context-card__val" :title="contextUser">{{ contextUser }}</span>
                </div>
                <div v-if="contextEnv" class="tw-context-card__row">
                  <span class="tw-context-card__key">{{ t('app.titleBar.menu.contextEnv') }}</span>
                  <span class="tw-context-card__val" :title="contextEnv">{{ contextEnv }}</span>
                </div>
                <div v-if="contextInfo.database" class="tw-context-card__row">
                  <span class="tw-context-card__key">{{ t('app.titleBar.menu.contextDatabase') }}</span>
                  <span class="tw-context-card__val" :title="contextInfo.database">{{ contextInfo.database }}</span>
                </div>
                <div v-if="contextInfo.table" class="tw-context-card__row">
                  <span class="tw-context-card__key">{{ t('app.titleBar.menu.contextTable') }}</span>
                  <span class="tw-context-card__val" :title="contextInfo.table">{{ contextInfo.table }}</span>
                </div>
              </template>
              <div v-else class="tw-context-card__empty">{{ t('app.titleBar.menu.contextIdle') }}</div>
            </div>
            <div class="tw-context-card__foot">
              <div class="tw-context-card__foot-title">{{ t('app.titleBar.menu.contextConnected') }}</div>
              <ul v-if="contextPooledResources.length" class="tw-context-card__list" role="listbox">
                <li v-for="row in contextPooledResources" :key="row.id">
                  <button
                      type="button"
                      class="tw-context-card__pick"
                      :class="{'is-active': row.id === contextInfo.connectionId}"
                      role="option"
                      :aria-selected="row.id === contextInfo.connectionId"
                      :title="row.env ? `${row.label} · ${row.env}` : row.label"
                      @click="onPickContextResource(row)"
                  >
                    <span class="tw-context-card__pick-icon">
                      <TreeNodeIcon
                          type="connection"
                          :db-type="row.dbType"
                          :plugin-id="row.pluginId || undefined"
                      />
                    </span>
                    <span class="tw-context-card__pick-text">
                      <span class="tw-context-card__pick-name">{{ row.label }}</span>
                      <span v-if="row.env" class="tw-context-card__pick-env">{{ row.env }}</span>
                    </span>
                  </button>
                </li>
              </ul>
              <div v-else class="tw-context-card__foot-empty">
                {{ t('app.titleBar.menu.contextConnectedEmpty') }}
              </div>
            </div>
          </div>
          <!-- 「更多」：常用一级直达；仅「工具」二级飞出 -->
          <div
              v-if="moreUsesFlyout && moreMenuRows.length"
              class="titlebar-widgets__panel-body titlebar-widgets__panel-body--flyout-host"
          >
            <template v-for="row in moreMenuRows" :key="row.kind === 'leaf' ? row.item.id : row.id">
              <div v-if="row.kind === 'divider'" class="titlebar-widgets__divider" role="separator"/>

              <div
                  v-else-if="row.kind === 'submenu'"
                  class="titlebar-widgets__submenu"
                  @mouseenter="openFlyout(row.id)"
                  @mouseleave="scheduleCloseFlyout"
              >
                <button
                    type="button"
                    class="titlebar-widgets__item"
                    :class="{'is-open': openFlyoutId === row.id}"
                    role="menuitem"
                    :aria-expanded="openFlyoutId === row.id"
                    :aria-haspopup="true"
                    @mousedown.stop
                    @click.stop.prevent="openFlyout(row.id)"
                >
                  <span class="titlebar-widgets__item-leading" aria-hidden="true">
                    <TitleBarMenuIcon :name="row.icon" size="md"/>
                  </span>
                  <span class="titlebar-widgets__item-label">{{ row.label }}</span>
                  <DwIcon class="titlebar-widgets__item-chevron" name="chevron-right" size="xs" :stroke-width="1.75"/>
                </button>

                <div
                    v-if="openFlyoutId === row.id"
                    class="titlebar-widgets__flyout"
                    role="menu"
                    :aria-label="row.label"
                    @mouseenter="openFlyout(row.id)"
                    @mouseleave="scheduleCloseFlyout"
                    @mousedown.stop
                >
                  <button
                      v-for="item in row.items"
                      :key="item.id"
                      type="button"
                      class="titlebar-widgets__item"
                      :class="{'is-active': item.active, 'is-checked': item.checked === true}"
                      :role="isToggleItem(item) ? 'menuitemcheckbox' : 'menuitem'"
                      :aria-checked="isToggleItem(item) ? (item.checked ? 'true' : 'false') : undefined"
                      @mousedown.stop
                      @click.stop.prevent="onSelectItem(item)"
                  >
                    <span class="titlebar-widgets__item-leading" aria-hidden="true">
                      <TitleBarMenuIcon v-if="item.icon" :name="item.icon" size="md"/>
                    </span>
                    <span class="titlebar-widgets__item-label">{{ labelOf(item) }}</span>
                    <span
                        v-if="isToggleItem(item)"
                        class="titlebar-widgets__item-check-slot"
                        aria-hidden="true"
                    >
                      <span v-if="item.checked" class="titlebar-widgets__item-check-mark">✓</span>
                    </span>
                  </button>
                </div>
              </div>

              <button
                  v-else
                  type="button"
                  class="titlebar-widgets__item"
                  :class="{'is-active': row.item.active, 'is-checked': row.item.checked === true}"
                  :role="isToggleItem(row.item) ? 'menuitemcheckbox' : 'menuitem'"
                  :aria-checked="isToggleItem(row.item) ? (row.item.checked ? 'true' : 'false') : undefined"
                  @mouseenter="openFlyoutId = null"
                  @mousedown.stop
                  @click.stop.prevent="onSelectItem(row.item)"
              >
                <span class="titlebar-widgets__item-leading" aria-hidden="true">
                  <TitleBarMenuIcon v-if="row.item.icon" :name="row.item.icon" size="md"/>
                </span>
                <span class="titlebar-widgets__item-label">{{ labelOf(row.item) }}</span>
                <span
                    v-if="isToggleItem(row.item)"
                    class="titlebar-widgets__item-check-slot"
                    aria-hidden="true"
                >
                  <span v-if="row.item.checked" class="titlebar-widgets__item-check-mark">✓</span>
                </span>
              </button>
            </template>
          </div>

          <!-- 「新建」：一级扁平列表 -->
          <div v-else-if="panelGroups.length" class="titlebar-widgets__panel-body">
            <template v-for="group in panelGroups" :key="group.id">
              <button
                  v-for="item in group.items"
                  :key="item.id"
                  type="button"
                  class="titlebar-widgets__item"
                  :class="{'is-active': item.active, 'is-checked': item.checked === true}"
                  :role="isToggleItem(item) ? 'menuitemcheckbox' : 'menuitem'"
                  :aria-checked="isToggleItem(item) ? (item.checked ? 'true' : 'false') : undefined"
                  @mousedown.stop
                  @click.stop.prevent="onSelectItem(item)"
              >
                <span class="titlebar-widgets__item-leading" aria-hidden="true">
                  <TitleBarMenuIcon v-if="item.icon" :name="item.icon" size="md"/>
                </span>
                <span class="titlebar-widgets__item-label">{{ labelOf(item) }}</span>
                <span
                    v-if="isToggleItem(item)"
                    class="titlebar-widgets__item-check-slot"
                    aria-hidden="true"
                >
                  <span v-if="item.checked" class="titlebar-widgets__item-check-mark">✓</span>
                </span>
              </button>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </nav>
</template>

<style scoped>
/* widget 序列：左右两端实体控件，中间留白只负责拖窗 —— 不画任何分隔线 */
.titlebar-widgets {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  gap: 8px;
  padding: 0;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.tw-spacer {
  flex: 1 1 auto;
  min-width: 8px;
  height: 100%;
  -webkit-app-region: drag;
}

.tw-right {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  padding-right: 2px;
  -webkit-app-region: no-drag;
}

/* 上下文 widget：连接自证主入口；hover 才浮出底色 */
.tw-context {
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 280px;
  gap: 6px;
  height: var(--dw-titlebar-widget-h);
  padding: 0 8px;
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-titlebar-fg);
  font-family: inherit;
  font-size: var(--dw-font-size-titlebar);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.tw-context:hover,
.tw-context.is-open {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-titlebar-fg-strong);
}

/* 与项目切换器徽标同档：18×18 */
.tw-context__type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

.tw-context__type :deep(.community-plugin-icon),
.tw-context__type :deep(.community-plugin-icon.is-sm) {
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

.tw-context__type.is-warn {
  outline: 1px solid color-mix(in srgb, var(--dw-warning, #d97706) 55%, transparent);
  outline-offset: 1px;
  border-radius: 4px;
}

.tw-context__icon-fallback {
  width: 14px;
  height: 14px;
  color: var(--dw-titlebar-fg-muted);
}

.tw-context__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tw-context__caret {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  opacity: 0.45;
}

.tw-context:hover .tw-context__caret,
.tw-context.is-open .tw-context__caret {
  opacity: 0.8;
}

/*
 * Run widget：IDEA 的 run 控件是中性色线框三角，不套主题色描边 pill。
 * 层级只靠 18px 图标 + 文字，配色与整行其它 widget 完全一致。
 */
.tw-run {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  height: var(--dw-titlebar-widget-h);
  margin-right: 8px;
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  overflow: hidden;
}

.tw-run__main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 8px 0 7px;
  border: none;
  background: transparent;
  color: var(--dw-titlebar-fg);
  font-family: inherit;
  font-size: var(--dw-font-size-titlebar);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.tw-run__main:hover {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-titlebar-fg-strong);
}

.tw-run__glyph :deep(svg) {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  /* Play 图标保持空心线框，填充成实心会变成一块抢眼的色斑 */
  fill: none;
  shape-rendering: geometricPrecision;
}

.tw-run__caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-titlebar-fg);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.tw-run__caret:hover,
.tw-run__caret.is-open {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-titlebar-fg-strong);
}

.tw-run__caret :deep(svg) {
  width: 11px;
  height: 11px;
  opacity: 0.7;
}

/* 通用图标：统一 18px 单色 outline，只有 hover 出底色 */
.tw-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: var(--dw-titlebar-widget-h);
  padding: 0;
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-titlebar-fg);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.tw-icon :deep(.dw-icon-root) {
  --dw-icon-size: 18px;
  width: 18px;
  height: 18px;
  shape-rendering: geometricPrecision;
}

.tw-icon:hover,
.tw-icon.is-open {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-titlebar-fg-strong);
}

.tw-icon__dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.tw-icon__dots i {
  display: block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}

/* 下拉面板 — IDEA：图标 gutter + selection 条 + 可飞出二级 */
.titlebar-widgets__panel {
  position: fixed;
  z-index: var(--dw-z-window);
  min-width: 220px;
  max-width: 300px;
  border: 1px solid var(--dw-menu-border);
  border-radius: var(--dw-menu-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-menu-shadow);
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.titlebar-widgets__panel--flyout {
  overflow: visible;
  min-width: 240px;
}

.titlebar-widgets__panel--context {
  min-width: 320px;
  max-width: min(420px, 92vw);
}

.titlebar-widgets__panel--picker {
  min-width: min(560px, 92vw);
  max-width: min(640px, 94vw);
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
}

.titlebar-widgets__panel--picker :deep(.db-type-panel),
.titlebar-widgets__panel--picker :deep(.db-type-context-panel) {
  flex: 1;
  min-height: 280px;
  max-height: min(62vh, 500px);
}

.titlebar-widgets__panel-head {
  flex-shrink: 0;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-text) 8%, transparent);
  font-size: var(--dw-font-size-titlebar);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.titlebar-widgets__panel-body {
  max-height: min(460px, 56vh);
  overflow-y: auto;
  padding: var(--dw-menu-pad-y) var(--dw-menu-pad-x);
}

.titlebar-widgets__panel-body--flyout-host {
  overflow: visible;
  max-height: none;
}

.titlebar-widgets__divider {
  height: 1px;
  margin: 4px 0;
  background: color-mix(in srgb, var(--dw-text) 10%, transparent);
}

.titlebar-widgets__submenu {
  position: relative;
}

.titlebar-widgets__flyout {
  position: absolute;
  top: -4px;
  /* 「更多」在顶栏右侧：二级向左飞出，避免贴边裁切 */
  right: calc(100% - 2px);
  left: auto;
  z-index: 4;
  min-width: 228px;
  max-width: min(320px, 88vw);
  max-height: min(420px, 56vh);
  overflow-x: hidden;
  overflow-y: auto;
  padding: var(--dw-menu-pad-y) var(--dw-menu-pad-x);
  border: 1px solid var(--dw-menu-border);
  border-radius: var(--dw-menu-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-menu-shadow);
}

.titlebar-widgets__item {
  display: grid;
  grid-template-columns: var(--dw-menu-gutter) minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: var(--dw-menu-item-h);
  padding: 0 var(--dw-menu-item-pad-end) 0 0;
  border: none;
  border-radius: var(--dw-menu-item-radius);
  background: transparent;
  color: var(--dw-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 80ms ease, color 80ms ease;
}

.titlebar-widgets__item:hover,
.titlebar-widgets__item.is-open,
.titlebar-widgets__item.is-active {
  background: var(--dw-menu-active);
  color: var(--dw-text);
}

.titlebar-widgets__item-leading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-menu-gutter);
  height: var(--dw-menu-item-h);
  color: var(--dw-text-secondary);
}

.titlebar-widgets__item-label {
  min-width: 0;
  padding-right: 10px;
  font-size: var(--dw-font-size-menu);
  font-weight: 400;
  line-height: var(--dw-leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar-widgets__item-chevron {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  margin-right: 2px;
  opacity: 0.55;
  color: var(--dw-text-secondary);
}

.titlebar-widgets__item:hover .titlebar-widgets__item-chevron,
.titlebar-widgets__item.is-open .titlebar-widgets__item-chevron {
  opacity: 0.95;
}

.titlebar-widgets__item-check-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 2px;
  color: var(--dw-text-secondary);
}

.titlebar-widgets__item-check-mark {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--dw-text);
}

/* 上下文卡：状态信息，不是又一条菜单 */
.tw-context-card {
  padding: 12px 14px 10px;
}

.tw-context-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.tw-context-card__title {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.tw-context-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dw-success-fg, var(--dw-primary)) 12%, transparent);
  color: var(--dw-success-fg, var(--dw-primary));
  font-size: 11px;
  font-weight: 650;
  line-height: 16px;
}

.tw-context-card__badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
}

.tw-context-card__badge.is-warn {
  background: color-mix(in srgb, var(--dw-warning, #d97706) 14%, transparent);
  color: var(--dw-warning, #d97706);
}

.tw-context-card__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tw-context-card__row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  column-gap: 14px;
  min-width: 0;
}

.tw-context-card__key {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
}

.tw-context-card__val {
  min-width: 0;
  color: var(--dw-text);
  font-size: 13px;
  font-weight: 550;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tw-context-card__empty {
  padding: 4px 0 2px;
  font-size: 13px;
  color: var(--dw-text-secondary);
  line-height: 1.4;
}

.tw-context-card__foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--dw-border-light) 85%, transparent);
}

.tw-context-card__foot-title {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
  line-height: 1.35;
}

.tw-context-card__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 168px;
  overflow: auto;
}

.tw-context-card__pick {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
}

.tw-context-card__pick:hover {
  background: color-mix(in srgb, var(--dw-hover-bg, var(--dw-border-light)) 70%, transparent);
}

.tw-context-card__pick.is-active {
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.tw-context-card__pick-icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}

.tw-context-card__pick-text {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
}

.tw-context-card__pick-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 550;
  line-height: 1.3;
}

.tw-context-card__pick-env {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--dw-text-muted);
  line-height: 1.3;
}

.tw-context-card__foot-empty {
  padding: 4px 2px 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--dw-text-muted);
  line-height: 1.35;
}

/* 窄窗口：先收上下文文字，再收 Run 文字，图标始终保留 */
.titlebar-widgets--ctx-compact .tw-context__label,
.titlebar-widgets--ctx-overflow .tw-context__label,
.titlebar-widgets--nav-compact .tw-context__label,
.titlebar-widgets--nav-compact .tw-run__label {
  display: none;
}

.titlebar-widgets--ctx-overflow .tw-context__caret,
.titlebar-widgets--nav-compact .tw-context__caret {
  display: none;
}

.titlebar-widgets--nav-compact .tw-context,
.titlebar-widgets--ctx-overflow .tw-context {
  padding: 0 9px;
}

.titlebar-widgets--nav-compact .tw-run__main {
  padding: 0 8px;
}

.titlebar-dropdown-enter-active,
.titlebar-dropdown-leave-active {
  transition: opacity var(--dw-duration) var(--dw-ease), transform var(--dw-duration) var(--dw-ease);
}

.titlebar-dropdown-enter-from,
.titlebar-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
