import {shouldShowRuntimeSetupWizard} from '@/features/onboarding/services/runtime-setup.service'

/**
 * `ui-tour` kept for API/compat; auto boot funnel no longer returns it (A0-4).
 * Full / first-insight tours stay opt-in via profile «replay guide».
 */
export type FirstRunFunnelStep = 'runtime-setup' | 'ui-tour' | 'none'

/**
 * First-run funnel:
 * 1. Packaged desktop: runtime connector setup when pending
 * 2. Otherwise land on Welcome — no auto spotlight tour
 *
 * Runtime setup always wins when pending so connectors land first.
 */
export async function resolveFirstRunFunnelStep(
    storage: Storage = localStorage,
): Promise<FirstRunFunnelStep> {
    if (await shouldShowRuntimeSetupWizard(storage)) {
        return 'runtime-setup'
    }
    return 'none'
}

/**
 * After runtime wizard finishes or is skipped, do not auto-chain into a UI tour.
 * Users start on Welcome; tour remains available from the profile menu.
 */
export function shouldContinueToUiTourAfterRuntime(
    _storage: Storage = localStorage,
): boolean {
    return false
}
