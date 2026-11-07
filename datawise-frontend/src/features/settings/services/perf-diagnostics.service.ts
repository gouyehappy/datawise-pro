import {bindPerfLogGate} from '@/core/utils/perf-log'
import {
    isProductionPerfActive,
    isProductionPerfModeEnabled,
} from '@/features/settings/services/production-perf-mode.service'
import type {ConnectionEnvSource} from '@/features/settings/services/production-perf-mode.policy'

type ExplorerFindNode = (nodeId: string) => ConnectionEnvSource | null

let explorerFindNode: ExplorerFindNode | null = null

function computeShouldEmit(connectionId?: string): boolean {
    if (import.meta.env.DEV) return true
    if (!isProductionPerfModeEnabled()) return false
    if (!connectionId?.trim()) return false
    if (!explorerFindNode) return false
    return isProductionPerfActive(connectionId, explorerFindNode)
}

/** Explorer store registers findNode after Pinia boots (avoids @/api cycle in HTTP layer). */
export function bindExplorerFindNode(findNode: ExplorerFindNode | null): void {
    explorerFindNode = findNode
    bindPerfLogGate(computeShouldEmit)
}

/** @deprecated Prefer {@link import('@/core/utils/perf-log').shouldEmitPerfLog} */
export function shouldEmitPerfLog(connectionId?: string): boolean {
    return computeShouldEmit(connectionId)
}
