import {isUnsavedConnectionId} from '@/features/connection/utils/connection-defaults'
import {resolveApiErrorMessage, resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'

export type ConnectionCatalogMutation = 'save' | 'delete'

export function isPersistedConnectionId(connectionId: string | undefined): boolean {
    return Boolean(connectionId?.trim()) && !isUnsavedConnectionId(connectionId)
}

export function resolveConnectionCatalogErrorMessage(
    error: unknown,
    translate: (key: string) => string,
    mutation: ConnectionCatalogMutation,
): string {
    const localized = resolveDisplayApiErrorMessage(error, translate)
    const raw = resolveApiErrorMessage(error)
    if (localized !== raw) return localized

    if (raw.includes('CONNECTION_ACCESS_DENIED')) {
        return translate(
            mutation === 'delete'
                ? 'connection.deleteAccessDenied'
                : 'connection.saveAccessDenied',
        )
    }
    return raw || translate(
        mutation === 'delete'
            ? 'explorer.deleteFailed'
            : 'connection.saveFailed',
    )
}

/** @deprecated use resolveConnectionCatalogErrorMessage */
export function resolveConnectionSaveErrorMessage(
    error: unknown,
    translate: (key: string) => string,
): string {
    return resolveConnectionCatalogErrorMessage(error, translate, 'save')
}
