import type { Ns } from './types'

export const ALL_NS_TREE_KEY = '__all'

export type NsOption = { value: string; label: string }

/** Polaris namespaces are named strings; empty means “all” in list filters. */
export function nsTreeKey(ns: string | null | undefined): string {
  const v = String(ns ?? '').trim()
  return v || ALL_NS_TREE_KEY
}

export function nsIdFromTreeKey(key: string): string {
  return key === ALL_NS_TREE_KEY ? '' : key
}

export function buildNamespaceOptions(list: Ns[], allLabel: string): NsOption[] {
  const opts: NsOption[] = [{ value: '', label: allLabel }]
  const seen = new Set<string>([''])
  for (const n of list || []) {
    const value = String(n.name || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    opts.push({ value, label: value })
  }
  return opts
}

export function pickDefaultNamespace(list: Ns[]): string {
  return String(list?.[0]?.name || '').trim()
}
