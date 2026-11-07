/**
 * Neutral context-menu types for `@datawise/overlays`.
 * No product / `@/core/types` imports — host may keep a wider icon union.
 */

/** DwIcon name or free string (package keeps icons as strings only). */
export type ContextMenuIcon = string

export interface ContextMenuItem {
  id: string
  label: string
  /** Non-clickable section header (tray-style muted title). */
  header?: boolean
  disabled?: boolean
  /** Native title when disabled (capability unsupported, etc.). */
  disabledHint?: string
  children?: ContextMenuItem[]
  /** Hover custom submenu panel id (via registerContextMenuSubmenuPanel). */
  submenuPanel?: string
  divider?: boolean
  /** Alias some hosts use; prefer {@link divider}. */
  separator?: boolean
  icon?: ContextMenuIcon
  shortcut?: string
  accent?: boolean
  /** Currently selected (e.g. view switcher menus). */
  selected?: boolean
  danger?: boolean
}
