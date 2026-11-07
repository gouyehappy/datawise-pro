import type { Ns } from './types'

export const PUBLIC_NS_TREE_KEY = '__public'

/** Nacos public namespace is always the empty tenant id. */
export function normalizeNamespaceId(id: string | null | undefined): string {
  const v = String(id ?? '').trim()
  if (!v || /^public$/i.test(v) || /^public_namespace$/i.test(v)) return ''
  return v
}

/** Stable map key for tree expand/children state. */
export function nsTreeKey(nsId: string | null | undefined): string {
  return normalizeNamespaceId(nsId) || PUBLIC_NS_TREE_KEY
}

/** Inverse of nsTreeKey. */
export function nsIdFromTreeKey(key: string): string {
  return key === PUBLIC_NS_TREE_KEY ? '' : key
}

export type NsOption = { value: string; label: string }

export function buildNamespaceOptions(list: Ns[], publicLabel: string): NsOption[] {
  const opts: NsOption[] = [{ value: '', label: publicLabel }]
  const seen = new Set<string>([''])
  for (const n of list || []) {
    const value = normalizeNamespaceId(n.id)
    if (seen.has(value)) continue
    seen.add(value)
    const label = (n.name || n.id || value || publicLabel).trim() || publicLabel
    opts.push({ value, label: value ? label : publicLabel })
  }
  return opts
}

export function pickDefaultNamespace(list: Ns[], preferred?: string | null): string {
  const want = normalizeNamespaceId(preferred)
  const ids = new Set((list || []).map((n) => normalizeNamespaceId(n.id)))
  ids.add('')
  if (ids.has(want)) return want
  return ''
}
