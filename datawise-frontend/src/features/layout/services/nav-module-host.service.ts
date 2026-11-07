import type {FeatureNavModuleContribution, FeatureWorkspaceOpenId} from '@/core/feature-contract'

/**
 * Host dispatch for Feature Contract navModules (A-10).
 * Layout setModule consults contributions; open handlers live here — not `if (module === '…')`.
 */
export function dispatchWorkspaceOpen(open: FeatureWorkspaceOpenId): void {
    switch (open) {
        case 'communityPluginCenter':
            void import('@/features/workspace/stores/workspace').then(({useWorkspaceStore}) => {
                useWorkspaceStore().openCommunityPluginCenter()
            })
            return
        default: {
            const _exhaustive: never = open
            void _exhaustive
        }
    }
}

/**
 * @returns true when setModule should NOT assign activeModule (workspace-open redirect).
 */
export function tryDispatchNavModuleContribution(contrib: FeatureNavModuleContribution): boolean {
    if (contrib.kind !== 'workspace-open' || !contrib.open) return false
    dispatchWorkspaceOpen(contrib.open)
    return true
}
