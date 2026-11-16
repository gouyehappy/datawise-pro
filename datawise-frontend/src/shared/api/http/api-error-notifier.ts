import type {ApiError} from '@/shared/api/http/request'

/** 透传给全局通知器的请求上下文（用于区分后台任务与用户主动操作）。 */
export type ApiErrorNotifyOptions = {
    silent?: boolean
    background?: boolean
}

export type ApiErrorNotifier = (
    message: string,
    error: ApiError,
    options?: ApiErrorNotifyOptions,
) => void

let notifier: ApiErrorNotifier | null = null

export function registerApiErrorNotifier(fn: ApiErrorNotifier | null) {
    notifier = fn
}

export function notifyApiError(error: ApiError, options?: ApiErrorNotifyOptions) {
    if (options?.silent || !notifier) return
    notifier(error.message, error, options)
}
