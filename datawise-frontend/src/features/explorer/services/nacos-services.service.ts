export type {
    NacosServiceSummary,
    NacosServicesResult,
    NacosInstanceSummary,
    NacosInstancesResult,
} from '@/shared/api/nacos.types'

import type {NacosServiceSummary} from '@/shared/api/nacos.types'

export function nacosServiceRowKey(service: Pick<NacosServiceSummary, 'groupName' | 'name'>): string {
    return `${service.groupName ?? 'DEFAULT_GROUP'}/${service.name ?? ''}`
}
