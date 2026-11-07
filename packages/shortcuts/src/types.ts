/** Neutral shortcut id — host may narrow to a product union. */
export type ShortcutActionId = string

/** Host may use fixed categories ('explorer' | …) or free-form strings. */
export type ShortcutCategory = string

/** global：应用级常驻；local：仅所在页面挂载时生效（如 SQL 编辑器） */
export type ShortcutScope = 'global' | 'local'

export interface ShortcutDefinition {
  id: ShortcutActionId
  category: ShortcutCategory
  scope: ShortcutScope
  labelKey: string
  defaultBinding: string
  /** DwIcon name (or host alias resolved before render). */
  icon: string
}

export type ShortcutPreferences = Partial<Record<ShortcutActionId, string>>
