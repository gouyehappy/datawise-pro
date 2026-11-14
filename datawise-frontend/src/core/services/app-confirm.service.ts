import type {ConfirmDialogRequest} from '@/core/composables/useConfirmDialog'

type AppConfirmHandler = (request: ConfirmDialogRequest) => Promise<boolean>

let handler: AppConfirmHandler | null = null

/** Mounted by AppConfirmHost; services call {@link askAppConfirm}. */
export function setAppConfirmHandler(next: AppConfirmHandler | null): void {
    handler = next
}

/**
 * App-themed confirm for non-Vue call sites (desktop bridge, tree actions, etc.).
 * Falls back to {@code window.confirm} only when no host is mounted (tests / early boot).
 */
export async function askAppConfirm(request: ConfirmDialogRequest): Promise<boolean> {
    if (handler) {
        return handler(request)
    }
    if (typeof window === 'undefined') {
        return false
    }
    const body = request.message ? `${request.title}\n\n${request.message}` : request.title
    return window.confirm(body)
}
