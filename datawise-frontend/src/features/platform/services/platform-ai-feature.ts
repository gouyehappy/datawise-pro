import type {PlatformFeatureId} from '@/features/platform/types/platform.types'

/** Platform catalog features that require pack.ai / free AI allowance (Wave 34). */
export function isPlatformAiFeature(feature: PlatformFeatureId): boolean {
    return feature === 'semantic_metrics'
        || feature === 'analysis_canvas'
        || feature === 'federated_views'
}

/** Platform catalog features that require pack.governance (Wave 35). */
export function isPlatformGovernanceFeature(feature: PlatformFeatureId): boolean {
    return feature === 'schema_drift' || feature === 'data_quality'
}

