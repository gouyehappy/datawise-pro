import {onMounted, onUnmounted, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {buildWorkbenchContextSnapshot} from '@/features/ai/context/services/build-workbench-context'
import {
    heartbeatWorkbenchContext,
    publishWorkbenchContext,
} from '@/features/ai/context/services/workbench-context.api'

const FOCUS_DEBOUNCE_MS = 300
const BODY_DEBOUNCE_MS = 1000
const HEARTBEAT_MS = 15_000

/**
 * Publishes live workspace / explorer focus to the backend for MCP + in-app AI.
 */
export function useWorkbenchContextPublisher() {
    const workspace = useWorkspaceStore()
    const explorer = useExplorerStore()
    const layout = useLayoutStore()
    const auth = useAuthStore()

    const {tabs, activeTabId, activeTab} = storeToRefs(workspace)
    const {tree, selectedNodeId} = storeToRefs(explorer)

    let focusTimer: ReturnType<typeof setTimeout> | null = null
    let bodyTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let lastBodyKey = ''
    let disposed = false

    function clearFocusTimer() {
        if (focusTimer) {
            clearTimeout(focusTimer)
            focusTimer = null
        }
    }

    function clearBodyTimer() {
        if (bodyTimer) {
            clearTimeout(bodyTimer)
            bodyTimer = null
        }
    }

    function canPublish(): boolean {
        return !disposed && Boolean(auth.sessionId)
    }

    function buildSnapshot() {
        return buildWorkbenchContextSnapshot({
            tabs: tabs.value,
            activeTab: activeTab.value,
            explorerTree: tree.value,
            selectedNodeId: selectedNodeId.value,
            layoutModule: layout.activeModule ?? null,
        })
    }

    async function publishNow() {
        if (!canPublish()) return
        try {
            await publishWorkbenchContext(buildSnapshot())
        } catch {
            // Best-effort: offline / 401 should not break the shell.
        }
    }

    function scheduleFocusPublish() {
        clearFocusTimer()
        focusTimer = setTimeout(() => {
            focusTimer = null
            void publishNow()
        }, FOCUS_DEBOUNCE_MS)
    }

    function scheduleBodyPublish() {
        const tab = activeTab.value
        const bodyKey = `${tab?.id ?? ''}:${tab?.sql ?? ''}`
        if (bodyKey === lastBodyKey) return
        lastBodyKey = bodyKey
        clearBodyTimer()
        bodyTimer = setTimeout(() => {
            bodyTimer = null
            void publishNow()
        }, BODY_DEBOUNCE_MS)
    }

    async function beat() {
        if (!canPublish()) return
        try {
            await heartbeatWorkbenchContext()
        } catch {
            // ignore
        }
    }

    onMounted(() => {
        scheduleFocusPublish()
        heartbeatTimer = setInterval(() => {
            void beat()
        }, HEARTBEAT_MS)
    })

    onUnmounted(() => {
        disposed = true
        clearFocusTimer()
        clearBodyTimer()
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer)
            heartbeatTimer = null
        }
    })

    watch(
        [activeTabId, selectedNodeId, () => layout.activeModule, () => tabs.value.length],
        () => scheduleFocusPublish(),
    )

    watch(
        () => activeTab.value?.sql,
        () => scheduleBodyPublish(),
    )

    watch(
        () => auth.sessionId,
        (session) => {
            if (session) scheduleFocusPublish()
        },
    )
}
