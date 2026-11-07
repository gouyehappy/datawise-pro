/** Stacking for dock floats vs drop minimap (must stay in sync across Host / Overlay / AppShell). */
export const DOCK_FLOAT_Z_INDEX = 1020
/** Extra ranks for click-to-front among overlapping floats (4 panels). Stay below drop overlay. */
export const DOCK_FLOAT_STACK_SPAN = 4
/** DropZone overlay — above floated panels so slots stay hittable while dragging. */
export const DOCK_DROP_ZONE_Z_INDEX = 1080
/**
 * Context menus / submenus (CSS `--dw-z-context-menu`) must stay above floats + drop overlay.
 * Keep in sync with `variables.css`.
 */
export const DOCK_CONTEXT_MENU_MIN_Z_INDEX = 1500
