import {onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {isNativeTerminalAvailable} from '@/features/terminal/services/native-terminal'
import {
    buildTerminalCliSnippet,
    type TerminalCliSnippet,
} from '@/features/terminal/services/terminal-connection-context.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'

const HINT_VISIBLE_MS = 3000

export function useTerminalConnectionHint() {
    const workspace = useWorkspaceStore()
    const explorer = useExplorerStore()
    const layout = useLayoutStore()
    const {t} = useI18n()

    const snippet = ref<TerminalCliSnippet | null>(null)
    const connectionLabel = ref('')
    const visible = ref(false)

    let hideTimer: ReturnType<typeof setTimeout> | undefined

    function clearHideTimer() {
        if (hideTimer) clearTimeout(hideTimer)
        hideTimer = undefined
    }

    function revealHint() {
        clearHideTimer()
        visible.value = Boolean(snippet.value)
        if (!snippet.value) return
        hideTimer = setTimeout(() => {
            visible.value = false
        }, HINT_VISIBLE_MS)
    }

    async function refreshHint() {
        if (!isNativeTerminalAvailable()) {
            snippet.value = null
            visible.value = false
            return
        }

        const tab = workspace.activeTab
        const connectionId = tab?.connectionId
        if (!connectionId) {
            snippet.value = null
            visible.value = false
            return
        }

        const config = await fetchConnectionConfig(connectionId)
        const nextSnippet = config ? buildTerminalCliSnippet(config, tab?.database) : null
        snippet.value = nextSnippet
        connectionLabel.value =
            explorer.findNode(connectionId)?.label?.trim() || config?.name?.trim() || connectionId
        revealHint()
    }

    watch(
        () => [workspace.activeTabId, workspace.activeTab?.connectionId, workspace.activeTab?.database] as const,
        () => {
            void refreshHint()
        },
    )

    onMounted(() => {
        void refreshHint()
    })

    onUnmounted(() => {
        clearHideTimer()
    })

    async function copyCommand() {
        if (!snippet.value) return
        try {
            await navigator.clipboard.writeText(snippet.value.command)
            layout.showSuccessToast(t('terminal.contextCopied'))
        } catch {
            layout.showErrorToast(t('terminal.contextCopyFailed'))
        }
    }

    return {
        snippet,
        connectionLabel,
        visible,
        copyCommand,
        refreshHint,
    }
}
