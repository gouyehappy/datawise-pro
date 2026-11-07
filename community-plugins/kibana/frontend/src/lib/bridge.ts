import type { HostContext, IndexInfo, SearchResult } from './types'

type HostInfo = {
  theme?: { appearance?: string; tokens?: Record<string, string> }
  appearance?: string | { colorScheme?: string; colors?: Record<string, string> }
}

type HostBridge = {
  ready: Promise<void>
  context?: HostContext
  locale?: string
  theme?: { appearance?: string; tokens?: Record<string, string> }
  appearance?: string | { colorScheme?: string }
  invoke(method: string, params?: unknown, options?: { timeoutMs?: number }): Promise<unknown>
  getHostInfo?(): Promise<HostInfo>
  onHostInfo?(fn: (info: HostInfo) => void): () => void
  onAppearanceChange?(fn: (appearance: unknown) => void): () => void
  onContext?(fn: (ctx: HostContext) => void): () => void
  onContextChange?(fn: (ctx: HostContext) => void): () => void
}

declare global {
  interface Window {
    datawisePlugin?: HostBridge
  }
}

export function getBridge(): HostBridge | undefined {
  return window.datawisePlugin
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

export function connectionIdFrom(ctx: HostContext | undefined): string {
  return ctx?.connectionId || ctx?.connection?.id || ''
}

export function defaultIndexFrom(ctx: HostContext | undefined): string {
  const cfg = ctx?.connection?.config
  const v = cfg?.default_index ?? cfg?.defaultIndex
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

export async function invoke<T>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 60000,
): Promise<T> {
  const b = getBridge()
  if (!b) throw new Error('DataWise Host Bridge unavailable')
  await b.ready
  return (await b.invoke(method, params, { timeoutMs })) as T
}

export async function listIndices(connectionId: string): Promise<IndexInfo[]> {
  const res = await invoke<{ indices?: IndexInfo[] }>('kibana/indices', { connectionId })
  return res.indices || []
}

export async function searchLogs(
  connectionId: string,
  params: {
    index: string
    query: string
    fromTime: string
    toTime: string
    timeField?: string
    size?: number
    fromOffset?: number
    sortOrder?: 'asc' | 'desc'
  },
): Promise<SearchResult> {
  const res = await invoke<SearchResult>('kibana/search', {
    connectionId,
    ...params,
  })
  // Normalize hit.source from JSON string if needed
  const hits = (res.hits || []).map((h) => {
    let source = h.source
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source) as Record<string, unknown>
      } catch {
        source = { _raw: source }
      }
    }
    return { ...h, source: source || {} }
  })
  return { ...res, hits }
}

export function totalHits(total: SearchResult['total']): number {
  if (typeof total === 'number') return total
  if (total && typeof total === 'object' && typeof total.value === 'number') return total.value
  return 0
}
