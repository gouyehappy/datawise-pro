import type {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'

export type OnboardingTourPlacement = 'center' | 'right' | 'left' | 'top' | 'bottom'

export interface OnboardingTourStep {
    id: string
    target?: string
    placement: OnboardingTourPlacement
    prepare?: (ctx: OnboardingTourContext) => void | Promise<void>
}

export interface OnboardingTourContext {
    layout: ReturnType<typeof useLayoutStore>
    appConfig: ReturnType<typeof useAppConfigStore>
    workspace: ReturnType<typeof useWorkspaceStore>
}

export const ONBOARDING_TOUR_STEPS: OnboardingTourStep[] = [
    {
        id: 'welcome',
        placement: 'center',
    },
    {
        id: 'home',
        target: isDesktopApp() ? 'titlebar-app-menu' : 'nav-home',
        placement: 'right',
    },
    {
        id: 'database',
        target: 'nav-database',
        placement: 'right',
        prepare({layout, appConfig}) {
            appConfig.setShowExplorerPanel(true)
            layout.setModule('database')
        },
    },
    {
        id: 'explorer',
        target: 'explorer-panel',
        placement: 'right',
        prepare({layout, appConfig}) {
            appConfig.setShowExplorerPanel(true)
            layout.setModule('database')
        },
    },
    {
        id: 'workspace',
        target: 'workspace-main',
        placement: 'top',
        prepare({layout, appConfig}) {
            appConfig.setShowExplorerPanel(true)
            layout.setModule('database')
        },
    },
    {
        id: 'ai',
        target: 'nav-ai',
        placement: 'right',
    },
    {
        id: 'terminal',
        target: 'nav-terminal',
        placement: 'right',
    },
    {
        id: 'team',
        target: 'team-module',
        placement: 'top',
        prepare({layout}) {
            layout.setModule('team')
        },
    },
    {
        id: 'tips',
        placement: 'center',
    },
]

export const ONBOARDING_FIRST_INSIGHT_STEPS: OnboardingTourStep[] = [
    {
        id: 'insightWelcome',
        placement: 'center',
        prepare({layout, appConfig}) {
            appConfig.setShowExplorerPanel(true)
            layout.setModule('database')
        },
    },
    {
        id: 'insightExplorer',
        target: 'explorer-panel',
        placement: 'right',
        prepare({layout, appConfig}) {
            appConfig.setShowExplorerPanel(true)
            layout.setModule('database')
        },
    },
    {
        id: 'insightAi',
        target: 'nav-ai',
        placement: 'right',
        prepare({layout}) {
            layout.setModule('ai')
        },
    },
    {
        id: 'insightDone',
        placement: 'center',
    },
]

export type OnboardingTourPreset = 'default' | 'first-insight'

export function resolveOnboardingTourSteps(preset: OnboardingTourPreset): OnboardingTourStep[] {
    return preset === 'first-insight' ? ONBOARDING_FIRST_INSIGHT_STEPS : ONBOARDING_TOUR_STEPS
}

export const ONBOARDING_STEP_IDS = [
    ...ONBOARDING_TOUR_STEPS.map((step) => step.id),
    ...ONBOARDING_FIRST_INSIGHT_STEPS.map((step) => step.id),
]
