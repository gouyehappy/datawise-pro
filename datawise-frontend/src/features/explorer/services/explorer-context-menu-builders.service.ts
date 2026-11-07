import type {ComposerTranslation} from 'vue-i18n'
import type {ContextMenuItem, DbType, TreeNode} from '@/core/types'
import {isPinnableExplorerNode} from '@/features/explorer/services/explorer-pinned-sort.service'
import {
    buildConnectionMenuOpenItemsFromProfile,
    getExplorerUiProfile,
} from '@/features/explorer/services/explorer-ui-catalog.service'

function connectionCatalogTailItems(t: ComposerTranslation): ContextMenuItem[] {
    return [
        {id: 'edit', label: t('explorer.context.editConnection'), icon: 'edit', shortcut: 'F4'},
        {id: 'move', label: t('explorer.context.moveConnection'), icon: 'file'},
        {id: 'refresh', label: t('explorer.context.refresh'), icon: 'refresh'},
        {id: 'copy-name', label: t('explorer.context.copyName'), icon: 'copy'},
        {id: 'divider-1', label: '', divider: true},
        {id: 'delete', label: t('explorer.context.deleteConnection'), icon: 'delete', shortcut: 'Delete', danger: true},
    ]
}

/**
 * Base context-menu rows for platform connections with an explorer-ui catalog profile.
 * Returns null for JDBC / unknown types (no profile) so callers keep the default path.
 */
export function buildSpecializedConnectionMenuItems(
    dbType: DbType | undefined,
    t: ComposerTranslation,
): ContextMenuItem[] | null {
    if (!dbType) return null
    const profile = getExplorerUiProfile(dbType)
    if (!profile?.features.length) return null
    const openItems = buildConnectionMenuOpenItemsFromProfile(profile, t)
    if (!openItems.length) return null
    return [...openItems, ...connectionCatalogTailItems(t)]
}

/** Map explorer folder labels to specialized context-menu type keys. */
export function resolveExplorerContextMenuType(node: Pick<TreeNode, 'id' | 'type' | 'label'>): string {
    if (node.type === 'folder' && node.label === 'models') return 'folder-models'
    if (node.type === 'folder' && node.label === 'tables') return 'folder-tables'
    if (node.type === 'sql_file' && node.id.startsWith('project-file:')) return 'project-file'
    if (node.type === 'project-files-hint') {
        if (node.id.includes('project-scripts')) return 'project-scripts'
        if (node.id.includes('project-docs')) return 'project-docs'
        // nested folder hint: prefer scripts/docs from path segment
        if (node.id.includes(':scripts:')) return 'project-scripts'
        if (node.id.includes(':docs:')) return 'project-docs'
        return 'project-docs'
    }
    return node.type
}

/** Disable the CSV import action and attach a capability hint. */
export function withCsvImportMenuDisabled(
    items: ContextMenuItem[],
    disabledHint: string,
): ContextMenuItem[] {
    return items.map((item) =>
        item.id === 'import'
            ? {
                ...item,
                disabled: true,
                disabledHint,
            }
            : item,
    )
}

/**
 * Adjust context-menu pin/favorite labels (and inject pin for non-table pinnable nodes).
 */
export function buildPinContextMenuItems(
    node: Pick<TreeNode, 'type'>,
    items: ContextMenuItem[],
    pinned: boolean,
    t: ComposerTranslation,
): ContextMenuItem[] {
    if (!isPinnableExplorerNode(node)) return items

    const pinLabel = node.type === 'table'
        ? t(pinned ? 'explorer.context.unfavoriteTable' : 'explorer.context.favoriteTable')
        : t(pinned ? 'explorer.context.unpinFromTop' : 'explorer.context.pinToTop')

    if (node.type === 'table') {
        return items.map((item) => item.id === 'pin' ? {...item, label: pinLabel} : item)
    }

    const pinItem: ContextMenuItem = {
        id: 'pin',
        label: pinLabel,
        icon: 'pin',
    }
    return [
        pinItem,
        {id: 'divider-pin', label: '', divider: true},
        ...items.filter((item) => item.id !== 'pin'),
    ]
}

/** Prepend JDBC SSH tunnel open action when tunnel is enabled for the connection. */
export function prependJdbcSshTunnelMenuItems(
    items: ContextMenuItem[],
    t: ComposerTranslation,
): ContextMenuItem[] {
    return [
        {
            id: 'open-jdbc-ssh-tunnel',
            label: t('explorer.context.openJdbcSshTunnel'),
            icon: 'console',
        },
        {id: 'divider-jdbc-ssh', label: '', divider: true},
        ...items,
    ]
}

/** Prepend "move connection here" when a connection is selected onto a group. */
export function prependMoveConnectionHereMenuItems(
    items: ContextMenuItem[],
    connectionLabel: string,
    t: ComposerTranslation,
): ContextMenuItem[] {
    return [
        {
            id: 'move-here',
            label: t('explorer.context.moveConnectionHere', {name: connectionLabel}),
            icon: 'file',
        },
        {id: 'divider-move', label: '', divider: true},
        ...items,
    ]
}

export function resolveDeleteCatalogDialogCopy(
    node: Pick<TreeNode, 'type' | 'label'> | null | undefined,
    t: ComposerTranslation,
): {title: string; message: string; confirmLabel: string} {
    if (!node) {
        return {
            title: t('explorer.deleteConnectionTitle'),
            message: '',
            confirmLabel: t('explorer.context.deleteConnection'),
        }
    }
    if (node.type === 'group') {
        return {
            title: t('explorer.deleteGroupTitle'),
            message: t('explorer.deleteGroupMessage', {name: node.label}),
            confirmLabel: t('explorer.context.deleteGroup'),
        }
    }
    return {
        title: t('explorer.deleteConnectionTitle'),
        message: t('explorer.deleteConnectionMessage', {name: node.label}),
        confirmLabel: t('explorer.context.deleteConnection'),
    }
}

/** True when any explorer dialog / context menu is open (blocks keyboard shortcuts). */
export function isExplorerUiBlocking(flags: Record<string, boolean>): boolean {
    for (const value of Object.values(flags)) {
        if (value) return true
    }
    return false
}
