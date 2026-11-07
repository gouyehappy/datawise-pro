import {computed} from 'vue'
import type {DbType} from '@/core/types'
import {
    filterExplorerAddMenuItems,
    getExplorerAddMenuItems,
    parseDbTypeMenuId,
} from '@/features/explorer/constants/explorer-add-menu'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {
    canImportExplorerConnections,
    canMutateConnectionCatalog,
} from '@/features/auth/services/feature-permission.service'
import {useI18n} from 'vue-i18n'

/** 工具栏「+」添加数据源菜单逻辑 */
export function useExplorerAddMenu(options?: {
    onClose?: () => void
    onCreateFolder?: () => void
    onExportProjectConnections?: () => void
    onImportConnections?: () => void
}) {
    const {t} = useI18n()
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const auth = useAuthStore()

    const menuItems = computed(() =>
        filterExplorerAddMenuItems(getExplorerAddMenuItems(t), auth.isGuest),
    )

    function close() {
        options?.onClose?.()
    }

    function openConnectionForm(dbType: DbType) {
        workspace.openConnectionForm(dbType)
        close()
    }

    function onMenuSelect(id: string) {
        const dbType = parseDbTypeMenuId(id)
        if (dbType) {
            openConnectionForm(dbType)
            return
        }
        if (id === 'new-folder') {
            if (!canMutateConnectionCatalog(auth.isGuest)) {
                layout.showErrorToast(t('auth.permissionDenied'))
                close()
                return
            }
            options?.onCreateFolder?.()
            close()
            return
        }
        if (id === 'import-connections') {
            if (!canImportExplorerConnections(auth.isGuest)) {
                layout.showErrorToast(t('auth.permissionDenied'))
                close()
                return
            }
            // Parent owns the file picker so unmounting this menu cannot drop the flow.
            options?.onImportConnections?.()
            close()
            return
        }
        if (id === 'export-project-connections') {
            if (!canImportExplorerConnections(auth.isGuest)) {
                layout.showErrorToast(t('auth.permissionDenied'))
                close()
                return
            }
            options?.onExportProjectConnections?.()
            close()
            return
        }
        close()
    }

    return {
        menuItems,
        onMenuSelect,
        openConnectionForm,
    }
}
