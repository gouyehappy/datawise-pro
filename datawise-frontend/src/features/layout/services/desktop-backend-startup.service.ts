import {reactive, readonly} from 'vue'
import {readDesktopBridge} from '@/features/layout/services/desktop-bridge'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {markStartupPhase, type StartupTimingPhase} from '@/app/services/startup-timing.service'

export type BackendStartupPhase =
    | 'idle'
    | 'config'
    | 'spawning'
    | 'warming'
    | 'session'
    | 'sync'
    | 'ready'
    | 'failed'

export interface BackendStartupEvent {
    phase: BackendStartupPhase
    progress: number
}

/** 主进程 JVM health OK 的上限；100% 留给渲染进程会话/配置同步 */
export const DESKTOP_BACKEND_READY_PROGRESS = 78

/** Web splash only — desktop must not pad shell-ready for aesthetics. */
const MIN_VISIBLE_MS = isDesktopApp() ? 0 : 480
const TICK_MS = 48
const MIN_STEP = 0.35
const MAX_STEP = 2.6

const state = reactive({
    phase: 'idle' as BackendStartupPhase,
    targetProgress: 0,
    displayProgress: 0,
    complete: false,
    startedAt: 0,
})

export const desktopStartupProgress = readonly(state)

let unsubscribe: (() => void) | undefined
let tickTimer: ReturnType<typeof setInterval> | null = null
let finalizeWaiters: Array<() => void> = []

function stopTicker() {
    if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = null
    }
}

function ensureTicker() {
    if (tickTimer) return
    if (!state.startedAt) state.startedAt = Date.now()
    tickTimer = setInterval(tickProgress, TICK_MS)
}

function tickProgress() {
    if (state.complete) {
        stopTicker()
        return
    }

    const gap = state.targetProgress - state.displayProgress
    if (gap > 0) {
        const step = Math.min(MAX_STEP, Math.max(MIN_STEP, gap * 0.11))
        state.displayProgress = Math.min(state.targetProgress, state.displayProgress + step)
    }

    if (
        state.targetProgress >= 100
        && state.displayProgress >= 99.5
        && Date.now() - state.startedAt >= MIN_VISIBLE_MS
    ) {
        state.displayProgress = 100
        state.complete = true
        stopTicker()
        const waiters = finalizeWaiters
        finalizeWaiters = []
        waiters.forEach((resolve) => resolve())
    }
}

export function setDesktopStartupTarget(progress: number, phase?: BackendStartupPhase): void {
    const capped = Math.max(0, Math.min(100, progress))
    state.targetProgress = Math.max(state.targetProgress, capped)
    if (phase) state.phase = phase
    ensureTicker()
}

/** 订阅 Java 主进程 startup-progress；由 bootstrap-app 在桌面启动时调用一次 */
export function initDesktopBackendStartupListener(): void {
    if (unsubscribe) return

    const bridge = readDesktopBridge()
    const backend = bridge?.backend
    if (!backend) return

    void backend.getStartupState?.().then((snapshot) => {
        if (snapshot) applyStartupEvent(normalizeStartupEvent(snapshot))
    })

    unsubscribe = backend.onStartupProgress?.((event) => {
        applyStartupEvent(normalizeStartupEvent(event))
    })
}

function normalizeStartupEvent(event: { phase: string; progress: number }): BackendStartupEvent {
    const phase = event.phase as BackendStartupPhase
    return {phase, progress: event.progress}
}

const HOST_PHASE_TO_TIMING: Partial<Record<BackendStartupPhase, StartupTimingPhase>> = {
    config: 'jvm-config',
    spawning: 'jvm-spawning',
    warming: 'jvm-warming',
    ready: 'jvm-ready',
    failed: 'failed',
}

export function applyStartupEvent(event: BackendStartupEvent): void {
    const timingPhase = HOST_PHASE_TO_TIMING[event.phase]
    if (timingPhase) markStartupPhase(timingPhase)

    if (event.phase === 'failed') {
        state.phase = 'failed'
        state.complete = true
        stopTicker()
        return
    }

    let progress = event.progress
    if (event.phase === 'ready') {
        progress = Math.min(progress, DESKTOP_BACKEND_READY_PROGRESS)
    }
    setDesktopStartupTarget(progress, event.phase)
}

export function markDesktopBackendStartupComplete(): void {
    markStartupPhase('jvm-ready')
    setDesktopStartupTarget(DESKTOP_BACKEND_READY_PROGRESS, 'ready')
}

export function reportDesktopBootstrapSessionProgress(): void {
    setDesktopStartupTarget(86, 'session')
}

export function reportDesktopBootstrapSyncProgress(): void {
    setDesktopStartupTarget(94, 'sync')
}

export function reportDesktopBootstrapHealthPollProgress(elapsedMs: number, timeoutMs: number): void {
    const ratio = 1 - Math.exp(-elapsedMs / Math.max(1, timeoutMs / 3))
    const progress = 48 + Math.round(ratio * 26)
    setDesktopStartupTarget(Math.min(progress, DESKTOP_BACKEND_READY_PROGRESS - 2), 'warming')
}

const FINALIZE_TIMEOUT_MS = 6_000

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function finalizeDesktopStartup(): Promise<void> {
    setDesktopStartupTarget(100, 'ready')
    if (state.complete) return

    // Desktop: shell-first — complete immediately; progress UI is already silent.
    if (isDesktopApp() || MIN_VISIBLE_MS <= 0) {
        state.displayProgress = 100
        state.complete = true
        stopTicker()
        const waiters = finalizeWaiters
        finalizeWaiters = []
        waiters.forEach((resolve) => resolve())
        return
    }

    await Promise.race([
        new Promise<void>((resolve) => {
            finalizeWaiters.push(resolve)
            ensureTicker()
            tickProgress()
        }),
        delay(FINALIZE_TIMEOUT_MS).then(() => {
            state.displayProgress = 100
            state.complete = true
            stopTicker()
            const waiters = finalizeWaiters
            finalizeWaiters = []
            waiters.forEach((resolve) => resolve())
        }),
    ])
}

export function disposeDesktopBackendStartupListener(): void {
    unsubscribe?.()
    unsubscribe = undefined
    stopTicker()
}
