import type {EntitlementMode} from '@/features/pack/types/pack.types'

/** §3.1 — Explain graph / index hints require DataOps (ops.explain.pro). */
export function hasExplainProAccess(options: {
    mode: EntitlementMode
    dataopsUsable: boolean
}): boolean {
    if (options.mode === 'open') return true
    return options.dataopsUsable
}
