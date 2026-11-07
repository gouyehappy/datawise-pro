import type {SqlSessionStatus} from '@/shared/api/types'
import {resolveCaughtApiErrorMessage} from '@/shared/api/http/api-error-message'
import {ApiError} from '@/shared/api/http/request'

export const DEFAULT_SQL_SESSION_STATUS: SqlSessionStatus = {
    autocommit: true,
    pending: false,
}

export function isManualTransactionMode(status: SqlSessionStatus | null | undefined): boolean {
    return status != null && !status.autocommit
}

export function canCommitOrRollback(status: SqlSessionStatus | null | undefined): boolean {
    return isManualTransactionMode(status) && Boolean(status?.pending)
}

export function canBeginTransaction(
    status: SqlSessionStatus | null | undefined,
    connectionId?: string,
): boolean {
    return Boolean(connectionId) && (status == null || status.autocommit)
}

export function resolveTransactionScopeKey(
    connectionId?: string,
    database?: string,
): string {
    return `${connectionId ?? ''}:${database ?? ''}`
}

function isConnectionAccessDenied(error: unknown): boolean {
    if (error instanceof ApiError && error.data && typeof error.data === 'object') {
        const code = (error.data as {errorCode?: unknown}).errorCode
        if (code === 'CONNECTION_ACCESS_DENIED') return true
    }
    const raw = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : ''
    return raw.includes('CONNECTION_ACCESS_DENIED')
}

export function resolveTransactionErrorMessage(
    error: unknown,
    translate: (key: string) => string,
): string {
    // Manual-txn copy is more specific than the generic connection-access i18n.
    if (isConnectionAccessDenied(error)) {
        return translate('console.transaction.dmlAccessDenied')
    }
    return resolveCaughtApiErrorMessage(error, translate, 'console.transaction.actionFailed')
}
