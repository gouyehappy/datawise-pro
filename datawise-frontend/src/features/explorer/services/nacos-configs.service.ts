export type {
    NacosInfo,
    NacosNamespaceSummary,
    NacosNamespacesResult,
    NacosConfigSummary,
    NacosConfigsResult,
    NacosConfigDetail,
} from '@/shared/api/nacos.types'

import type {NacosConfigSummary} from '@/shared/api/nacos.types'

export function nacosConfigRowKey(config: Pick<NacosConfigSummary, 'dataId' | 'group' | 'namespaceId'>): string {
    return `${config.namespaceId ?? ''}/${config.group ?? ''}/${config.dataId ?? ''}`
}
