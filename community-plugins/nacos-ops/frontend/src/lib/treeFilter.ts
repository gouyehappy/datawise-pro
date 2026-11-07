import type { TreeChild } from '../components/NamespaceTree'

export function filterTreeChildren(
  childrenByNs: Record<string, TreeChild[]>,
  query: string,
  mode: 'configs' | 'services',
): Record<string, TreeChild[]> {
  const q = query.trim().toLowerCase()
  if (!q) return childrenByNs
  const out: Record<string, TreeChild[]> = {}
  for (const [k, kids] of Object.entries(childrenByNs)) {
    out[k] = kids.filter((c) => {
      if (mode === 'configs') {
        if (c.kind !== 'config') return false
        return (
          (c.row.dataId || '').toLowerCase().includes(q) ||
          (c.row.group || '').toLowerCase().includes(q) ||
          (c.row.appName || '').toLowerCase().includes(q)
        )
      }
      if (c.kind !== 'service') return false
      return (
        (c.row.name || '').toLowerCase().includes(q) ||
        (c.row.groupName || '').toLowerCase().includes(q)
      )
    })
  }
  return out
}
