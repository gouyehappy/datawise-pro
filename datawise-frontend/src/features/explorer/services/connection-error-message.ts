import type {ApiError} from '@/shared/api/http/request'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import {t} from '@/i18n'

export const JDBC_DRIVER_ERROR_CODE = 'JDBC_DRIVER_REQUIRED'
export const JDBC_DRIVER_LOAD_ERROR_CODE = 'JDBC_DRIVER_LOAD_FAILED'

type ApiErrorData = {
    errorCode?: string
}

export function readApiErrorCode(error: unknown): string | undefined {
    if (!(error instanceof Error) || error.name !== 'ApiError') return undefined
    const data = (error as ApiError).data as ApiErrorData | undefined
    return data?.errorCode
}

export function isJdbcDriverError(error: unknown): boolean {
    const code = readApiErrorCode(error)
    return code === JDBC_DRIVER_ERROR_CODE || code === JDBC_DRIVER_LOAD_ERROR_CODE
}

export function resolveConnectionErrorMessage(error: unknown): string {
    const code = readApiErrorCode(error)
    if (code === JDBC_DRIVER_ERROR_CODE) {
        return t('explorer.connectionDriverMissing')
    }
    if (code === JDBC_DRIVER_LOAD_ERROR_CODE) {
        return t('explorer.connectionDriverLoadFailed')
    }
    // Connect API may return `{ok:false, message}` instead of throwing ApiError.
    const asError =
        error instanceof Error
            ? error
            : (typeof error === 'object' && error && 'message' in error
                && typeof (error as {message?: unknown}).message === 'string'
                && (error as {message: string}).message.trim())
              ? new Error((error as {message: string}).message.trim())
              : error
    // Prefer product copy (never flash raw DATASOURCE_NOT_AVAILABLE: mysql toasts).
    const localized = resolveDisplayApiErrorMessage(asError, (key) => String(t(key)))
    if (localized?.trim()) {
        return localized.trim()
    }
    if (asError instanceof Error && asError.message.trim()) {
        return asError.message.trim()
    }
    return t('explorer.connectionLoadFailed')
}
