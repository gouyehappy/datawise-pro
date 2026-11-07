import type {ContextMenuItem, DbType} from '@/core/types'
import type {ComposerTranslation} from 'vue-i18n'
import {pruneContextMenuDividers} from '@/core/utils/context-menu'
import {
    canImportExplorerConnections,
    canMutateConnectionCatalog,
    canUseExplorerAddMenu,
} from '@/features/auth/services/feature-permission.service'

export const DB_TYPE_MENU_PREFIX = 'db-type:'

export function getExplorerAddMenuItems(t: ComposerTranslation): ContextMenuItem[] {
    return [
        {id: 'new-folder', label: t('explorer.newFolder'), icon: 'file'},
        {
            id: 'add-connection',
            label: t('explorer.newConnection'),
            icon: 'connection',
            submenuPanel: 'db-type',
        },
        {id: 'divider-1', label: '', divider: true},
        {id: 'import-connections', label: t('explorer.importConnections'), icon: 'import'},
        {id: 'export-project-connections', label: t('explorer.exportProjectConnections'), icon: 'export'},
    ]
}

export function isDbTypeMenuId(id: string): boolean {
    return id.startsWith(DB_TYPE_MENU_PREFIX)
}

export function parseDbTypeMenuId(id: string): DbType | null {
    if (!isDbTypeMenuId(id)) return null
    return id.slice(DB_TYPE_MENU_PREFIX.length) as DbType
}

export function toDbTypeMenuId(dbType: DbType): string {
    return `${DB_TYPE_MENU_PREFIX}${dbType}`
}

export function filterExplorerAddMenuItems(items: ContextMenuItem[], isGuest: boolean): ContextMenuItem[] {
    if (!canUseExplorerAddMenu(isGuest)) return []

    const filtered = items.filter((item) => {
        if (item.divider) return true
        if (item.id === 'import-connections' || item.id === 'export-project-connections') {
            return canImportExplorerConnections(isGuest)
        }
        if (item.id === 'new-folder' || item.id === 'add-connection') {
            return canMutateConnectionCatalog(isGuest)
        }
        return true
    })
    return pruneContextMenuDividers(filtered)
}
