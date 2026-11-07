import { storageGet, storageSet } from './bridge'

const KEY = 'jenkins.pins.v1'

export async function loadPins(): Promise<string[]> {
  try {
    const raw = await storageGet(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export async function savePins(pins: string[]): Promise<void> {
  const unique = [...new Set(pins.filter(Boolean))]
  await storageSet(KEY, JSON.stringify(unique.slice(0, 40)))
}

export function togglePin(pins: string[], fullName: string): string[] {
  if (pins.includes(fullName)) return pins.filter((p) => p !== fullName)
  return [fullName, ...pins].slice(0, 40)
}
