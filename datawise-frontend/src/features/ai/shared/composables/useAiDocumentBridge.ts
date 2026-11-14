import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {storeToRefs} from 'pinia'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {extractDocumentFromContent} from '@/features/ai/chat/services/ai-chat.service'

type DocumentApplySnapshot = {
    tabId: string
    path: string
    content: string
}

function fileLabelFromPath(path: string, fallbackTitle?: string): string {
    const trimmed = path.trim()
    if (!trimmed) return (fallbackTitle ?? '').trim() || trimmed
    const parts = trimmed.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || trimmed
}

/** Apply AI reply content onto the active (or last-focused) local markdown / text tab. */
export function useAiDocumentBridge() {
    const {t} = useI18n()
    const toast = useAppToast()
    const workspace = useWorkspaceStore()
    const {activeTab, tabs} = storeToRefs(workspace)

    /** Last pre-apply body — one level, per tab. */
    const undoSnapshot = ref<DocumentApplySnapshot | null>(null)
    /** Soft memory so AI module / drawer can still target the last local doc after switching tabs. */
    const lastLocalTextTabId = ref<string | null>(null)

    watch(
        activeTab,
        (tab) => {
            if (tab?.type === 'local-text' && tab.localFilePath?.trim()) {
                lastLocalTextTabId.value = tab.id
            }
        },
        {immediate: true},
    )

    const applyTargetTab = computed(() => {
        const current = activeTab.value
        if (current?.type === 'local-text' && current.localFilePath?.trim()) {
            return current
        }
        const rememberedId = lastLocalTextTabId.value
        if (!rememberedId) return null
        const remembered = tabs.value.find((tab) => tab.id === rememberedId)
        if (remembered?.type === 'local-text' && remembered.localFilePath?.trim()) {
            return remembered
        }
        return null
    })

    const canApplyToDocument = computed(() => !!applyTargetTab.value)

    const documentApplyTargetLabel = computed(() => {
        const tab = applyTargetTab.value
        const path = tab?.localFilePath?.trim()
        if (!tab || !path) return null
        return fileLabelFromPath(path, tab.title)
    })

    const canUndoApplyToDocument = computed(() => {
        const tab = applyTargetTab.value
        const snap = undoSnapshot.value
        if (!tab || !snap || tab.type !== 'local-text') return false
        return tab.id === snap.tabId && (tab.localFilePath?.trim() || '') === snap.path
    })

    async function writeLocalTab(tabId: string, content: string): Promise<boolean> {
        workspace.updateTabSql(tabId, content)
        return workspace.saveDirtyTab(tabId)
    }

    async function undoApplyToDocument() {
        const tab = applyTargetTab.value
        const snap = undoSnapshot.value
        if (!tab || !snap || tab.id !== snap.tabId) {
            toast.error(t('ai.undoApplyUnavailable'))
            return
        }
        const ok = await writeLocalTab(tab.id, snap.content)
        if (ok) {
            undoSnapshot.value = null
            return
        }
        toast.error(t('ai.applyToDocumentFailed'))
    }

    async function applyToDocument(content: string) {
        const tab = applyTargetTab.value
        const path = tab?.localFilePath?.trim()
        if (!tab || tab.type !== 'local-text' || !path) {
            toast.error(t('ai.noLocalDocumentFocus'))
            return
        }
        const trimmed = content.trim()
        const doc = extractDocumentFromContent(trimmed)
        if (!doc) {
            toast.error(t('ai.noDocumentInReply'))
            return
        }
        const previous = tab.sql ?? ''
        if (previous === doc) {
            return
        }
        // Snapshot before overwrite so the user can restore the prior file.
        undoSnapshot.value = {tabId: tab.id, path, content: previous}
        const ok = await writeLocalTab(tab.id, doc)
        if (ok) {
            toast.show(t('ai.appliedToDocument'), {
                variant: 'success',
                durationMs: 8000,
                action: {
                    label: t('ai.undoApplyToDocument'),
                    onClick: () => {
                        void undoApplyToDocument()
                    },
                },
            })
            return
        }
        undoSnapshot.value = null
        toast.error(t('ai.applyToDocumentFailed'))
    }

    return {
        canApplyToDocument,
        canUndoApplyToDocument,
        documentApplyTargetLabel,
        extractDocumentFromContent,
        applyToDocument,
        undoApplyToDocument,
    }
}
