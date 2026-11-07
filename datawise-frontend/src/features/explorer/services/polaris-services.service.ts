export type {
    PolarisInfo,
    PolarisNamespaceSummary,
    PolarisNamespacesResult,
    PolarisServiceSummary,
    PolarisServicesResult,
    PolarisInstanceSummary,
    PolarisInstancesResult,
} from '@/shared/api/polaris.types'

import type {PolarisServiceSummary} from '@/shared/api/polaris.types'

export function polarisServiceRowKey(service: Pick<PolarisServiceSummary, 'namespace' | 'name'>): string {
    return `${service.namespace ?? ''}/${service.name ?? ''}`
}
