import {backendHealth} from '@/features/layout/services/backend-health.service'
import {desktopStartupProgress} from '@/features/layout/services/desktop-backend-startup.service'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {
    shouldSuppressApiErrorToast as shouldSuppressApiErrorToastWithContext,
    type ApiErrorToastContext,
} from '@/shared/api/http/api-error-toast-policy'

export type {ApiErrorToastContext} from '@/shared/api/http/api-error-toast-policy'
export {
    isExpectedServiceUnavailablePhase,
    shouldSuppressServiceUnavailableToast,
} from '@/shared/api/http/api-error-toast-policy'

function readApiErrorToastContext(): ApiErrorToastContext {
    return {
        desktopApp: isDesktopApp(),
        desktopStartupComplete: desktopStartupProgress.complete,
        backendOnline: backendHealth.status === 'online',
    }
}

export function shouldSuppressApiErrorToast(error: unknown): boolean {
    return shouldSuppressApiErrorToastWithContext(error, readApiErrorToastContext())
}
