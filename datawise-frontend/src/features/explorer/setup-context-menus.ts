/**
 * Explorer 相关右键菜单的全局注册（在 main.ts 启动时调用一次）
 *
 * 子菜单面板 id 与菜单项 `submenuPanel` 字段对应，见 explorer/constants/context-menus.ts
 */
import {registerContextMenuSubmenuPanel} from '@/core/context-menu'
import DbTypeSubmenuPanel from '@/features/explorer/components/DbTypeSubmenuPanel.vue'

export function setupExplorerContextMenus() {
    registerContextMenuSubmenuPanel('db-type', DbTypeSubmenuPanel)
}
