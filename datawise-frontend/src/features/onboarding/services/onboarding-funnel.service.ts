import {shouldShowOnboardingOnBoot} from '@/features/onboarding/services/onboarding.service'
import {shouldShowRuntimeSetupWizard} from '@/features/onboarding/services/runtime-setup.service'

export type FirstRunFunnelStep = 'runtime-setup' | 'ui-tour' | 'none'

/**
 * First-run funnel order:
 * 1. Packaged desktop: runtime connector setup (when pending)
 * 2. UI spotlight tour (includes team touchpoint)
 *
 * Runtime setup always wins when both are pending so health/connectors land first.
 */
export async function resolveFirstRunFunnelStep(
    storage: Storage = localStorage,
): Promise<FirstRunFunnelStep> {
    if (await shouldShowRuntimeSetupWizard(storage)) {
        return 'runtime-setup'
    }
    if (shouldShowOnboardingOnBoot(storage)) {
        return 'ui-tour'
    }
    return 'none'
}

/** After runtime wizard finishes or is skipped, continue into the UI tour when still pending. */
export function shouldContinueToUiTourAfterRuntime(
    storage: Storage = localStorage,
): boolean {
    return shouldShowOnboardingOnBoot(storage)
}
