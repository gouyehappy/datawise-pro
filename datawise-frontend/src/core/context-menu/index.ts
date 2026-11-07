/**
 * Unified context menu — SoT `@datawise/overlays`.
 * Product still types items with `@/core/types` ContextMenuItem (structurally compatible).
 */
export {
  ContextMenu,
  ContextMenuHost,
  ContextMenuIcon,
  useContextMenu,
  useContextMenuAnchor,
  registerContextMenuSubmenuPanel,
  resolveContextMenuSubmenuPanel,
  type ContextMenuItem as FrameworkContextMenuItem,
  type ContextMenuIconType as FrameworkContextMenuIcon,
} from '@datawise/overlays'
