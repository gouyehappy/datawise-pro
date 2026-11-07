export type {
    PolarisConfigSummary,
    PolarisConfigsResult,
    PolarisConfigDetail,
} from '@/shared/api/polaris.types'

import type {PolarisConfigSummary} from '@/shared/api/polaris.types'

export function polarisConfigRowKey(
    config: Pick<PolarisConfigSummary, 'namespace' | 'group' | 'name'>,
): string {
    return `${config.namespace ?? ''}/${config.group ?? ''}/${config.name ?? ''}`
}
