import {reactive, readonly} from 'vue'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {awaitUnauthorizedRecovery} from '@/features/auth/services/auth-session-recovery.service'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useNotificationStore} from '@/features/layout/stores/notification-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useProjectStore} from '@/features/project/stores/project'
import {
    settingsApi,
    type HealthStatus,
} from '@/api'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {clearSession, SESSION_KEY} from '@/shared/auth/session'
import {
    finalizeDesktopStartup,
    initDesktopBackendStartupListener,
    markDesktopBackendStartupComplete,
    reportDesktopBootstrapHealthPollProgress,
    reportDesktopBootstrapSessionProgress,
    reportDesktopBootstrapSyncProgress,
} from '@/features/layout/services/desktop-backend-startup.service'
import {applyBackendHealthResult} from '@/features/layout/services/backend-health.service'
import {waitForConnectorPluginsReady} from '@/features/datasource/services/connector-plugin-ready.service'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {markStartupPhase} from '@/app/services/startup-timing.service'

const desktopBoot = isDesktopApp()
const STEP_MIN_MS = desktopBoot ? 0 : 520
const MIN_SPLASH_MS = desktopBoot ? 0 : 800
const DESKTOP_BACKEND_WAIT_MS = 120_000
const DESKTOP_BACKEND_RETRY_MS = 250
/** Prefer prefs sync must not block shell forever (hung fetch / CEF stall). */
const CONFIG_SYNC_TIMEOUT_MS = 12_000

export type BootstrapStepId =
    | 'backend'
    | 'session'
    | 'explorer'
    | 'workspace'
    | 'notifications'
    | 'plugins'
    | 'teams'
    | 'finalize'

export type BackendConnectionStatus = 'idle' | 'checking' | 'connected' | 'offline'

const STEP_ORDER: BootstrapStepId[] = [
    'backend',
    'session',
    'explorer',
    'workspace',
    'notifications',
    'plugins',
    'teams',
    'finalize',
]

export interface BootstrapStepState {
    id: BootstrapStepId
    done: boolean
    active: boolean
}

function createStepStates(): BootstrapStepState[] {
    return STEP_ORDER.map((id) => ({id, done: false, active: false}))
}

const state = reactive({
    progress: 0,
    currentStep: 'backend' as BootstrapStepId,
    steps: createStepStates(),
    /** 桌面版：后端就绪后即视为启动完成（其余步骤后台加载） */
    startupComplete: false,
    backend: {
        status: 'idle' as BackendConnectionStatus,
        endpoint: settingsApi.resolveBackendEndpointLabel(),
        latencyMs: null as number | null,
        serverVersion: null as string | null,
    },
})

export const bootstrapProgress = readonly(state)

/** Failsafe for desktop boot timeout — leave skeleton even if a step never settles. */
export function forceBootstrapStartupComplete(reason = 'failsafe'): void {
    if (state.startupComplete) return
    console.warn(`[bootstrap] forcing startupComplete (${reason})`)
    state.progress = 100
    state.startupComplete = true
    state.steps.forEach((step) => {
        step.done = true
        step.active = false
    })
}

function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function safeLoad(task: () => Promise<unknown>) {
    return task().catch(() => undefined)
}

function withTimeout<T>(task: () => Promise<T>, ms: number, label: string): Promise<T | undefined> {
    return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
            console.warn(`[bootstrap] ${label} timed out after ${ms}ms`)
            resolve(undefined)
        }, ms)
        task()
            .then((value) => {
                window.clearTimeout(timer)
                resolve(value)
            })
            .catch((error) => {
                window.clearTimeout(timer)
                console.warn(`[bootstrap] ${label} failed`, error)
                resolve(undefined)
            })
    })
}

function stepIndex(id: BootstrapStepId) {
    return STEP_ORDER.indexOf(id)
}

function applyBackendResult(result: HealthStatus | null, endpoint: string) {
    applyBackendHealthResult(result, endpoint)
    state.backend.endpoint = endpoint
    if (!result) {
        state.backend.status = 'offline'
        state.backend.latencyMs = null
        state.backend.serverVersion = null
        return
    }
    state.backend.latencyMs = result.latencyMs
    state.backend.serverVersion = result.serverVersion ?? null
    state.backend.status = result.ok ? 'connected' : 'offline'
}

function syncStepVisual(id: BootstrapStepId, progress: number) {
    state.currentStep = id
    state.progress = progress
    const idx = stepIndex(id)
    state.steps.forEach((step, i) => {
        step.done = i < idx
        step.active = i === idx
    })
}

function markStepDone(id: BootstrapStepId) {
    const idx = stepIndex(id)
    const nextProgress = Math.round(((idx + 1) / STEP_ORDER.length) * 100)
    state.progress = Math.min(nextProgress, 100)
    state.steps.forEach((step, i) => {
        step.done = i <= idx
        step.active = false
    })
}

async function runStep(id: BootstrapStepId, task: () => Promise<unknown>) {
    const idx = stepIndex(id)
    syncStepVisual(id, Math.round((idx / STEP_ORDER.length) * 100))

    const started = Date.now()
    await task()
    const elapsed = Date.now() - started
    if (elapsed < STEP_MIN_MS) await delay(STEP_MIN_MS - elapsed)

    markStepDone(id)
}

function isBackendSessionId(sessionId: string | null | undefined): boolean {
    return Boolean(sessionId?.startsWith('session-'))
}

/** 桌面版：主进程已并行启动 JVM，渲染进程按健康检查轮询推进进度 */
async function waitForDesktopBackendHealth() {
    state.backend.status = 'checking'
    state.backend.endpoint = settingsApi.resolveBackendEndpointLabel()

    const started = Date.now()
    const deadline = started + DESKTOP_BACKEND_WAIT_MS
    let attempt = 0
    while (Date.now() < deadline) {
        const elapsed = Date.now() - started
        reportDesktopBootstrapHealthPollProgress(elapsed, DESKTOP_BACKEND_WAIT_MS)
        const snapshot = await settingsApi.pingHealth()
        if (snapshot.result?.ok) {
            applyBackendResult(snapshot.result, snapshot.endpoint)
            markDesktopBackendStartupComplete()
            return snapshot
        }
        attempt += 1
        await delay(attempt < 4 ? 120 : DESKTOP_BACKEND_RETRY_MS)
    }

    reportDesktopBootstrapHealthPollProgress(DESKTOP_BACKEND_WAIT_MS, DESKTOP_BACKEND_WAIT_MS)
    const last = await settingsApi.pingHealth()
    applyBackendResult(last.result, last.endpoint)
    if (last.result?.ok) {
        markDesktopBackendStartupComplete()
    }
    return last
}

/** 桌面版：恢复已有登录；无会话时再游客登录 */
async function bootstrapDesktopSession(auth: ReturnType<typeof useAuthStore>, backendConnected: boolean) {
    if (!backendConnected) {
        auth.bootstrap()
        return
    }

    const storedSessionId = localStorage.getItem(SESSION_KEY)
    const hadBackendSession = Boolean(storedSessionId && isBackendSessionId(storedSessionId))

    if (hadBackendSession) {
        try {
            await auth.bootstrapAsync(true)
            return
        } catch {
            clearSession()
        }
    } else if (storedSessionId) {
        clearSession()
    }

    try {
        await auth.loginAsGuest()
    } catch {
        auth.bootstrap()
    }
}

/** 应用启动：按步骤初始化，并驱动加载页进度展示 */
export async function bootstrapApp(): Promise<void> {
    const started = Date.now()
    const auth = useAuthStore()
    const explorer = useExplorerStore()
    markStartupPhase('bootstrap')

    if (desktopBoot) {
        initDesktopBackendStartupListener()
    }

    await runStep('backend', async () => {
        if (desktopBoot) {
            const snapshot = await waitForDesktopBackendHealth()
            if (snapshot.result?.ok) {
                markStartupPhase('health-ready')
                reportDesktopBootstrapSessionProgress()
                await safeLoad(() => bootstrapDesktopSession(auth, true))
                markStartupPhase('session-ready')
                reportDesktopBootstrapSyncProgress()
                await withTimeout(
                    () => useAppConfigStore().syncFromServer(),
                    CONFIG_SYNC_TIMEOUT_MS,
                    'syncFromServer',
                )
            } else {
                markStartupPhase('failed')
            }
            state.progress = 100
            await finalizeDesktopStartup()
            state.startupComplete = true
            return
        }

        state.backend.status = 'checking'
        state.backend.endpoint = settingsApi.resolveBackendEndpointLabel()
        const snapshot = await settingsApi.pingHealth()
        applyBackendResult(snapshot.result, snapshot.endpoint)
        if (snapshot.result?.ok) {
            markStartupPhase('health-ready')
        } else {
            markStartupPhase('failed')
        }
    })

    if (desktopBoot) {
        void bootstrapDesktopDeferredSteps(explorer)
        return
    }

    await runStep('session', async () => {
        const backendConnected = state.backend.status === 'connected'
        try {
            await auth.bootstrapAsync(backendConnected)
        } catch {
            auth.bootstrap()
        }
        await awaitUnauthorizedRecovery()
        markStartupPhase('session-ready')
    })

    // 会话就绪后再拉配置，避免未登录并发 PUT/GET 刷屏
    if (state.backend.status === 'connected') {
        await withTimeout(
            () => useAppConfigStore().syncFromServer(),
            CONFIG_SYNC_TIMEOUT_MS,
            'syncFromServer',
        )
    }

    await runStep('explorer', () => safeLoad(async () => {
        await waitForConnectorPluginsReady()
        await useDatasourceCatalogStore().reload().catch(() => undefined)
        await useProjectStore().load().catch(() => {})
        const expandedNodeIds = useAppConfigStore().config.explorer?.expandedNodeIds ?? []
        await explorer.loadTree({restoreExpandedIds: expandedNodeIds})
        const {useWorkspaceStore} = await import('@/features/workspace/stores/workspace')
        const {hydrateDiskBackedTabIfNeeded} = await import(
            '@/features/local-files/services/local-files-tab-hydrate'
        )
        const activeId = useWorkspaceStore().activeTabId
        // Retry only when body still missing (failed early hydrate); never force-overwrite.
        if (activeId) await hydrateDiskBackedTabIfNeeded(activeId)
    }))
    await runStep('workspace', () => safeLoad(() => useShortcutPanelStore().load()))
    await runStep('notifications', () => safeLoad(() => useNotificationStore().load()))
    await runStep('plugins', () => safeLoad(async () => {
        await usePluginStore().load()
        await useEntitlementStore().load()
    }))
    await runStep('teams', () => safeLoad(() => useTeamStore().load()))

    await runStep('finalize', async () => {
        syncStepVisual('finalize', 96)
        await delay(640)
    })

    state.progress = 100
    state.startupComplete = true
    state.steps.forEach((step) => {
        step.done = true
        step.active = false
    })

    const remain = MIN_SPLASH_MS - (Date.now() - started)
    if (remain > 0) await delay(remain)
}

async function bootstrapDesktopDeferredSteps(
    explorer: ReturnType<typeof useExplorerStore>,
) {
    await awaitUnauthorizedRecovery()
    // Health is already OK; wait for deferred config/plugins so explorer resolves plugin dbTypes.
    await safeLoad(() => waitForConnectorPluginsReady())
    await safeLoad(() => useDatasourceCatalogStore().reload())
    await safeLoad(async () => {
        await useProjectStore().load().catch(() => {})
        const expandedNodeIds = useAppConfigStore().config.explorer?.expandedNodeIds ?? []
        await explorer.loadTree({restoreExpandedIds: expandedNodeIds})
    })
    // Session restore may have hydrated before project files were ready; retry active disk-backed tab.
    await safeLoad(async () => {
        const {useWorkspaceStore} = await import('@/features/workspace/stores/workspace')
        const {hydrateDiskBackedTabIfNeeded} = await import(
            '@/features/local-files/services/local-files-tab-hydrate'
        )
        const activeId = useWorkspaceStore().activeTabId
        if (activeId) await hydrateDiskBackedTabIfNeeded(activeId)
    })
    await safeLoad(() => useShortcutPanelStore().load())
    await safeLoad(() => useNotificationStore().load())
    await safeLoad(() => usePluginStore().load())
    await safeLoad(() => useEntitlementStore().load())
    await safeLoad(() => useTeamStore().load())
}
