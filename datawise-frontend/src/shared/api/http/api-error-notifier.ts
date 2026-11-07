import type {ApiError} from '@/shared/api/http/request'

export type ApiErrorNotifier = (message: string, error: ApiError) => void

let notifier: ApiErrorNotifier | null = null

export function registerApiErrorNotifier(fn: ApiErrorNotifier | null) {
    notifier = fn
}

export function notifyApiError(error: ApiError, options?: { silent?: boolean }) {
    if (options?.silent || !notifier) return
    notifier(error.message, error)
}
