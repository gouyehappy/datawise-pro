import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {resolveStartupPhaseLabel} from '@/app/services/startup-phase-label'
import {
    desktopStartupProgress,
    type BackendStartupPhase,
} from '@/features/layout/services/desktop-backend-startup.service'

export function useStartupPhaseLabel() {
    const {t} = useI18n()
    return computed(() =>
        resolveStartupPhaseLabel(t, desktopStartupProgress.phase as BackendStartupPhase),
    )
}
