import type {ComposerTranslation} from 'vue-i18n'
import type {ContextMenuItem, TreeNode} from '@/core/types'
import {listSshScriptRecords} from '@/features/ssh/services/ssh-script-records.service'
import {
    buildConnectionFeatureChildrenFromProfile,
    ensureCatalogFeatureChildren,
    getExplorerUiProfile,
} from '@/features/explorer/services/explorer-ui-catalog.service'

export const SSH_SCRIPT_RECORDS_NODE_SUFFIX = ':ssh:script-records'
export const SSH_TERMINAL_NODE_SUFFIX = ':ssh-terminal'

export function sshScriptRecordsNodeId(connectionId: string): string {
    return `${connectionId}${SSH_SCRIPT_RECORDS_NODE_SUFFIX}`
}

export function parseSshScriptRecordsConnectionId(nodeId: string): string | null {
    if (!nodeId.endsWith(SSH_SCRIPT_RECORDS_NODE_SUFFIX)) return null
    return nodeId.slice(0, -SSH_SCRIPT_RECORDS_NODE_SUFFIX.length) || null
}

export function sshScriptRecordNodeId(connectionId: string, recordId: string): string {
    return `${connectionId}:ssh:script-record:${recordId}`
}

export function parseSshScriptRecordId(node: Pick<TreeNode, 'type' | 'id'>): string | null {
    if (node.type !== 'ssh-script-record') return null
    const marker = ':ssh:script-record:'
    const index = node.id.lastIndexOf(marker)
    if (index < 0) return null
    return node.id.slice(index + marker.length) || null
}

/** Extract connection id from an `ssh-terminal` tree node id (`{connectionId}:ssh-terminal`). */
export function parseSshTerminalConnectionId(nodeId: string): string | null {
    if (!nodeId.endsWith(SSH_TERMINAL_NODE_SUFFIX)) return null
    return nodeId.slice(0, -SSH_TERMINAL_NODE_SUFFIX.length) || null
}

export function buildSshScriptRecordsMenuItems(t: ComposerTranslation): ContextMenuItem[] {
    return [
        {id: 'new-ssh-script-record', label: t('ssh.scriptRecord.newRecord'), icon: 'file'},
        {id: 'refresh-ssh-script-records', label: t('ssh.scriptRecord.refresh'), icon: 'refresh'},
        {id: 'divider-1', label: '', divider: true},
        {id: 'copy-name', label: t('explorer.context.copyName'), icon: 'copy'},
    ]
}

export function buildSshScriptRecordMenuItems(t: ComposerTranslation): ContextMenuItem[] {
    return [
        {id: 'open', label: t('ssh.scriptRecord.open'), icon: 'open', shortcut: 'F4'},
        {id: 'rename-ssh-script-record', label: t('ssh.scriptRecord.rename'), icon: 'edit'},
        {id: 'delete-ssh-script-record', label: t('ssh.scriptRecord.delete'), icon: 'delete', danger: true},
        {id: 'divider-1', label: '', divider: true},
        {id: 'copy-name', label: t('explorer.context.copyName'), icon: 'copy'},
    ]
}

export function buildSshTerminalMenuItems(t: ComposerTranslation): ContextMenuItem[] {
    return [
        {id: 'open', label: t('explorer.context.openSshTerminal'), icon: 'console', shortcut: 'F4'},
        {id: 'new-ssh-terminal', label: t('explorer.context.newSshTerminal'), icon: 'console'},
        {id: 'copy-name', label: t('explorer.context.copyName'), icon: 'copy'},
    ]
}

export function buildSshConnectionFeatureChildren(connectionId: string): TreeNode[] {
    const profile = getExplorerUiProfile('ssh')
    if (!profile) return []
    return buildConnectionFeatureChildrenFromProfile(connectionId, profile)
}

export function ensureSshConnectionFeatureChildren(node: TreeNode): void {
    if (node.type !== 'connection' || node.dbType !== 'ssh') return
    ensureCatalogFeatureChildren(node)
}

export function buildSshScriptRecordNodes(
    connectionId: string,
    records: Array<{id: string; title: string}>,
): TreeNode[] {
    return records.map((record) => ({
        id: sshScriptRecordNodeId(connectionId, record.id),
        label: record.title,
        type: 'ssh-script-record' as const,
        dbType: 'ssh' as const,
        meta: record.id,
    }))
}

export async function refreshSshScriptRecordChildren(node: TreeNode, connectionId: string): Promise<void> {
    const records = await listSshScriptRecords(connectionId)
    node.children = buildSshScriptRecordNodes(connectionId, records)
    node.meta = 'loaded'
    node.childCount = node.children.length
}
