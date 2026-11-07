export {isUnauthorizedApiError, shouldRecoverStaleSession} from '@/shared/api/http/api-error'

export function shouldValidateBackendSession(hadSession: boolean, backendConnected: boolean): boolean {
    return hadSession && backendConnected
}
