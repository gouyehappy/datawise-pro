/**
 * Package-local grid column / row shapes — intentionally OpenAPI-free.
 * Host `TableColumn` / `TableRow` / `TableColumnDetail` are structurally compatible.
 */

export type TableColumn = {
  name: string
  /** Unique field key when JOIN duplicates names (e.g. c1, c2). */
  key?: string
  type?: string
}

export type TableRow = {
  [key: string]: string | number | boolean | null | Record<string, unknown> | unknown[]
}

/** Introspection-ish column detail used by edit / meta helpers (no shared/api import). */
export type TableColumnDetail = {
  name: string
  dataType?: string
  comment?: string | null
  keyType?: string | null
  autoIncrement?: boolean
  nullable?: boolean
  defaultValue?: string | null
  extra?: string | null
}
