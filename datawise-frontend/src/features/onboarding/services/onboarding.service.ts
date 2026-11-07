import {persistDesktopUiKeys} from '@/features/layout/services/desktop-ui-store'

export const ONBOARDING_COMPLETED_KEY = 'dw-cli-onboarding-completed'
export const ONBOARDING_FIRST_INSIGHT_COMPLETED_KEY = 'dw-cli-onboarding-first-insight-completed'

export {
    ONBOARDING_STEP_IDS,
    ONBOARDING_TOUR_STEPS,
} from '@/features/onboarding/services/onboarding-tour.config'
export type {
    OnboardingTourContext,
    OnboardingTourPlacement,
    OnboardingTourStep,
} from '@/features/onboarding/services/onboarding-tour.config'

export function isOnboardingCompleted(storage: Storage = localStorage): boolean {
    return storage.getItem(ONBOARDING_COMPLETED_KEY) === '1'
}

export function markOnboardingCompleted(storage: Storage = localStorage): void {
    storage.setItem(ONBOARDING_COMPLETED_KEY, '1')
    persistDesktopUiKeys({onboardingCompleted: '1'})
}

export function clearOnboardingCompleted(storage: Storage = localStorage): void {
    storage.removeItem(ONBOARDING_COMPLETED_KEY)
    persistDesktopUiKeys({onboardingCompleted: null})
}

export function shouldShowOnboardingOnBoot(storage: Storage = localStorage): boolean {
    return !isOnboardingCompleted(storage)
}

/** Hide login while a menu-opened wizard is covering the workbench. */
export function shouldShowLoginDialog(options: {
    loginDialogOpen: boolean
    onboardingOpen: boolean
    runtimeSetupOpen: boolean
    loginOverWizards?: boolean
}): boolean {
    if (!options.loginDialogOpen) return false
    if (options.loginOverWizards) return true
    if (options.onboardingOpen || options.runtimeSetupOpen) return false
    return true
}

export function isFirstInsightGuideCompleted(storage: Storage = localStorage): boolean {
    return storage.getItem(ONBOARDING_FIRST_INSIGHT_COMPLETED_KEY) === '1'
}

export function markFirstInsightGuideCompleted(storage: Storage = localStorage): void {
    storage.setItem(ONBOARDING_FIRST_INSIGHT_COMPLETED_KEY, '1')
    persistDesktopUiKeys({onboardingFirstInsightCompleted: '1'})
}
