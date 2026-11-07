import { storageGet, storageSet } from './bridge'

const KEY = 'jenkins.viewFavorites.v1'
const MAX = 16

export async function loadViewFavorites(): Promise<string[]> {
  try {
    const raw = await storageGet(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export async function saveViewFavorites(names: string[]): Promise<void> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  await storageSet(KEY, JSON.stringify(unique.slice(0, MAX)))
}

export function toggleViewFavorite(list: string[], name: string): string[] {
  const n = name.trim()
  if (!n) return list
  if (list.includes(n)) return list.filter((x) => x !== n)
  return [n, ...list].slice(0, MAX)
}
