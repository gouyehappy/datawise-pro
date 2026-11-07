/**
 * Context menu module for `@datawise/overlays`.
 *
 * Canonical copy lives here; host `datawise-frontend/src/core/context-menu`
 * remains the product source until full cutover.
 */
export {default as ContextMenu} from './ContextMenu.vue'
export {default as ContextMenuHost} from './ContextMenuHost.vue'
export {default as ContextMenuIcon} from './ContextMenuIcon.vue'
export {useContextMenu} from './useContextMenu'
export {useContextMenuAnchor} from './useContextMenuAnchor'
export {
  registerContextMenuSubmenuPanel,
  resolveContextMenuSubmenuPanel,
} from './submenu-panels'
export type {ContextMenuIcon as ContextMenuIconType, ContextMenuItem} from './types'
