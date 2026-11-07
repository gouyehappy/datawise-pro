import {ApiError, HTTP_NOT_READY} from '@/shared/api/http/request'

export interface ApiErrorToastContext {
    desktopApp: boolean
    desktopStartupComplete: boolean
    backendOnline: boolean
}

function isUnauthorizedApiError(error: unknown): boolean {
    if (!(error instanceof ApiError)) return false
    const message = error.message.trim()
    return message === 'UNAUTHORIZED' || message === 'HTTP 401'
}

function isServiceUnavailableError(error: unknown): boolean {
    if (!(error instanceof ApiError)) return false
    const message = error.message.trim()
    return message === HTTP_NOT_READY || message.startsWith('HTTP API request failed')
}

export function isExpectedServiceUnavailablePhase(context: ApiErrorToastContext): boolean {
    if (context.desktopApp && !context.desktopStartupComplete) return true
    return !context.backendOnline
}

export function shouldSuppressServiceUnavailableToast(
    error: unknown,
    context: ApiErrorToastContext,
): boolean {
    return isServiceUnavailableError(error) && isExpectedServiceUnavailablePhase(context)
}

export function shouldSuppressApiErrorToast(error: unknown, context: ApiErrorToastContext): boolean {
    if (isUnauthorizedApiError(error)) return true
    return shouldSuppressServiceUnavailableToast(error, context)
}
