import { storageGet, storageSet } from './bridge'

const KEY = 'jenkins.jobParams.v1'
const MAX_JOBS = 40

type Store = Record<string, Record<string, string>>

async function readStore(): Promise<Store> {
  try {
    const raw = await storageGet(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Store
  } catch {
    return {}
  }
}

export async function loadJobParams(jobName: string): Promise<Record<string, string>> {
  if (!jobName) return {}
  const store = await readStore()
  const row = store[jobName]
  return row && typeof row === 'object' ? { ...row } : {}
}

/** Persist last-used params (skips empty password values). */
export async function saveJobParams(
  jobName: string,
  values: Record<string, string>,
  passwordKeys: Set<string> = new Set(),
): Promise<void> {
  if (!jobName) return
  const cleaned: Record<string, string> = {}
  for (const [k, v] of Object.entries(values || {})) {
    if (passwordKeys.has(k)) continue
    cleaned[k] = String(v ?? '')
  }
  const store = await readStore()
  store[jobName] = cleaned
  const keys = Object.keys(store)
  if (keys.length > MAX_JOBS) {
    for (const k of keys.slice(0, keys.length - MAX_JOBS)) delete store[k]
  }
  await storageSet(KEY, JSON.stringify(store))
}
