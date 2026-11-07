import {onMounted, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    readLocalTextFile,
    statLocal,
} from '@/features/local-files/services/local-files.service'
import {normalizeLocalPathKey} from '@/features/local-files/services/local-files-path'
import {resolveTabLocalPath} from '@/features/local-files/services/local-files-workspace-tabs'

const POLL_MS = 2500

/**
 * Poll open local-file tabs for external disk changes.
 * Clean tabs auto-reload; dirty tabs ask before discarding edits.
 */
export function useLocalOpenFilesDiskWatch() {
    const {t} = useI18n()
    const workspace = useWorkspaceStore()
    const layout = useLayoutStore()
    const confirm = useConfirmDialog('danger')
    const baselines = new Map<string, number>()
    const prompting = new Set<string>()
    let timer: number | null = null
    let running = false

    const dialogOpen = confirm.open
    const dialogTitle = confirm.title
    const dialogMessage = confirm.message
    const dialogConfirmLabel = confirm.confirmLabel
    const dialogConfirmVariant = confirm.confirmVariant

    function rememberBaseline(path: string, mtimeMs: number) {
        baselines.set(normalizeLocalPathKey(path), mtimeMs)
    }

    async function refreshBaseline(path: string) {
        try {
            const stat = await statLocal(path)
            if (stat.exists && typeof stat.mtimeMs === 'number') {
                rememberBaseline(path, stat.mtimeMs)
            }
        } catch {
            /* ignore */
        }
    }

    async function applyDiskContent(tabId: string, path: string, content: string) {
        const tab = workspace.tabs.find((item) => item.id === tabId)
        if (!tab) return
        if (tab.type === 'local-text') {
            tab.sql = content
            tab.savedContent = content
        } else if (tab.type === 'console') {
            tab.sql = content
            workspace.markConsoleTabSaved(tabId, content)
        }
        await refreshBaseline(path)
    }

    async function handleExternalChange(tabId: string, path: string, content: string) {
        const key = normalizeLocalPathKey(path)
        if (prompting.has(key)) return
        prompting.add(key)
        try {
            const dirty = workspace.isTabDirty(tabId)
            if (!dirty) {
                await applyDiskContent(tabId, path, content)
                layout.showSuccessToast(t('explorer.localFiles.externalReloaded'))
                return
            }

            const ok = await confirm.ask({
                title: t('explorer.localFiles.externalChangedTitle'),
                message: t('explorer.localFiles.externalChangedMessage'),
                confirmLabel: t('explorer.localFiles.externalReload'),
                confirmVariant: 'danger',
            })
            if (!ok) return
            await applyDiskContent(tabId, path, content)
            layout.showSuccessToast(t('explorer.localFiles.externalReloaded'))
        } finally {
            prompting.delete(key)
        }
    }

    async function pollOnce() {
        if (running) return
        running = true
        try {
            for (const tab of workspace.tabs) {
                const path = resolveTabLocalPath(tab)
                if (!path) continue
                const key = normalizeLocalPathKey(path)
                let stat
                try {
                    stat = await statLocal(path)
                } catch {
                    continue
                }
                if (!stat.exists || typeof stat.mtimeMs !== 'number') {
                    if (baselines.has(key)) {
                        baselines.delete(key)
                        layout.showErrorToast(t('explorer.localFiles.externalGone', {
                            name: tab.title || path,
                        }))
                    }
                    continue
                }
                const prev = baselines.get(key)
                if (prev == null) {
                    baselines.set(key, stat.mtimeMs)
                    continue
                }
                if (stat.mtimeMs === prev) continue

                let diskContent: string
                try {
                    diskContent = await readLocalTextFile(path)
                } catch {
                    baselines.delete(key)
                    layout.showErrorToast(t('explorer.localFiles.externalGone', {
                        name: tab.title || path,
                    }))
                    continue
                }

                const saved =
                    tab.type === 'local-text'
                        ? (tab.savedContent ?? '')
                        : (tab.savedSql ?? '')
                const editor = tab.sql ?? ''

                // Self-save or already in sync with disk — only refresh mtime baseline.
                if (diskContent === saved || diskContent === editor) {
                    baselines.set(key, stat.mtimeMs)
                    if (diskContent === editor && diskContent !== saved) {
                        if (tab.type === 'local-text') tab.savedContent = diskContent
                        else if (tab.type === 'console') workspace.markConsoleTabSaved(tab.id, diskContent)
                    }
                    continue
                }

                baselines.set(key, stat.mtimeMs)
                await handleExternalChange(tab.id, path, diskContent)
            }

            const openKeys = new Set(
                workspace.tabs
                    .map((item) => resolveTabLocalPath(item))
                    .filter((item): item is string => Boolean(item))
                    .map((item) => normalizeLocalPathKey(item)),
            )
            for (const key of [...baselines.keys()]) {
                if (!openKeys.has(key)) baselines.delete(key)
            }
        } finally {
            running = false
        }
    }

    function onVisibility() {
        if (document.visibilityState === 'visible') void pollOnce()
    }

    onMounted(() => {
        timer = window.setInterval(() => void pollOnce(), POLL_MS)
        window.addEventListener('focus', onVisibility)
        document.addEventListener('visibilitychange', onVisibility)
        void pollOnce()
    })

    onUnmounted(() => {
        if (timer != null) window.clearInterval(timer)
        window.removeEventListener('focus', onVisibility)
        document.removeEventListener('visibilitychange', onVisibility)
    })

    return {
        dialogOpen,
        dialogTitle,
        dialogMessage,
        dialogConfirmLabel,
        dialogConfirmVariant,
        onDialogOpenUpdate: confirm.onOpenUpdate,
        onDialogConfirm: confirm.onConfirm,
        refreshBaseline,
    }
}
