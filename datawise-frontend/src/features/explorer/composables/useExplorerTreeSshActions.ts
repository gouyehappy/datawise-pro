import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode} from '@/core/types'
import {normalizeRenameInput} from '@/features/explorer/services/explorer-node-open.service'
import {listSshScriptRecordTabIds} from '@/features/explorer/services/explorer-menu-intents.service'
import {
    parseSshScriptRecordId,
    parseSshScriptRecordsConnectionId,
    sshScriptRecordNodeId,
} from '@/features/explorer/services/ssh-feature-tree.service'
import {createEmptySshScriptRecord} from '@/features/ssh/types/ssh-script-record.types'
import {resolveSshScriptRecordMessageKey} from '@/features/ssh/services/ssh-script-record-messages'
import {
    deleteSshScriptRecord,
    listSshScriptRecords,
    saveSshScriptRecord,
} from '@/features/ssh/services/ssh-script-records.service'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useWorkspaceStore} from '@/features/workspace/stores/workspace'

export interface ExplorerTreeSshActionsDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    workspace: ReturnType<typeof useWorkspaceStore>
    layout: ReturnType<typeof useLayoutStore>
    findConnectionId: (node: TreeNode) => string | undefined
    findConnectionLabel: (connectionId?: string) => string | undefined
}

export function useExplorerTreeSshActions(deps: ExplorerTreeSshActionsDeps) {
    const {t, explorer, workspace, layout, findConnectionId, findConnectionLabel} = deps

    async function createSshScriptRecord(connectionId: string) {
        const record = createEmptySshScriptRecord(
            `record-${Date.now()}`,
            t(resolveSshScriptRecordMessageKey('newRecord')),
        )
        try {
            const saved = await saveSshScriptRecord(connectionId, record)
            const folder = explorer.findNode(`${connectionId}:ssh:script-records`)
            if (folder) {
                folder.meta = undefined
                folder.children = []
                await explorer.expandAndLoad(folder.id, {notify: false})
            }
            workspace.openSshScriptRecord({
                connectionId,
                connectionName: findConnectionLabel(connectionId) ?? connectionId,
                recordId: saved.id,
                title: saved.title,
                contentHtml: saved.contentHtml,
                updatedAt: saved.updatedAt,
                explorerNodeId: sshScriptRecordNodeId(connectionId, saved.id),
            })
        } catch {
            layout.showErrorToast(t(resolveSshScriptRecordMessageKey('createFailed')))
        }
    }

    async function refreshSshScriptRecordsFolder(node: TreeNode) {
        const connectionId = parseSshScriptRecordsConnectionId(node.id) ?? findConnectionId(node)
        if (!connectionId) return
        node.meta = undefined
        node.children = []
        await explorer.expandAndLoad(node.id, {notify: false})
    }

    async function deleteSshScriptRecordFromNode(node: TreeNode) {
        const connectionId = findConnectionId(node)
        const recordId = parseSshScriptRecordId(node)
        if (!connectionId || !recordId) return
        try {
            await deleteSshScriptRecord(connectionId, recordId)
            for (const tabId of listSshScriptRecordTabIds(workspace.tabs, connectionId, recordId)) {
                workspace.closeTab(tabId)
            }
            const folder = explorer.findNode(`${connectionId}:ssh:script-records`)
            if (folder) {
                await refreshSshScriptRecordsFolder(folder)
            }
        } catch {
            layout.showErrorToast(t(resolveSshScriptRecordMessageKey('deleteFailed')))
        }
    }

    async function renameSshScriptRecordFromNode(node: TreeNode, nextTitle: string) {
        const connectionId = findConnectionId(node)
        const recordId = parseSshScriptRecordId(node)
        if (!connectionId || !recordId) return
        const trimmed = normalizeRenameInput(nextTitle, node.label)
        if (!trimmed) return
        try {
            const records = await listSshScriptRecords(connectionId)
            const record = records.find((item) => item.id === recordId)
            if (!record) {
                layout.showErrorToast(t(resolveSshScriptRecordMessageKey('loadFailed')))
                return
            }
            const saved = await saveSshScriptRecord(connectionId, {
                ...record,
                title: trimmed,
            })
            node.label = saved.title
            explorer.touchTree()
        } catch {
            layout.showErrorToast(t(resolveSshScriptRecordMessageKey('saveFailed')))
        }
    }

    return {
        createSshScriptRecord,
        refreshSshScriptRecordsFolder,
        deleteSshScriptRecordFromNode,
        renameSshScriptRecordFromNode,
    }
}
