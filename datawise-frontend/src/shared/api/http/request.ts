import type {ApiResponse} from '@/shared/api/types'
import {readApiBaseUrl} from '@/shared/api/mode'
import {notifyApiError} from '@/shared/api/http/api-error-notifier'
import {resolveApiErrorMessage} from '@/shared/api/http/api-error-message'
import {
    maybeRejectBlockedRequest,
    notifyUnauthorizedIfNeeded,
    readActiveSessionId,
    type SessionGuardOptions,
} from '@/shared/api/http/session-guard'
import {ApiError} from '@/shared/api/http/api-error'
import {SESSION_KEY} from '@/shared/auth/session'

export {ApiError} from '@/shared/api/http/api-error'

export const HTTP_NOT_READY =
    'HTTP API request failed. Ensure the backend is running and Vite proxy is configured.'

/** Fetch aborted via AbortSignal.timeout (distinct from backend-down). */
export const HTTP_TIMEOUT = 'HTTP_TIMEOUT'

export type HttpRequestOptions = {
    /** 不弹出全局错误 Toast（调用方自行展示） */
    silent?: boolean
    /** 请求超时（毫秒）；0 表示不限制 */
    timeoutMs?: number
    /** 会话失效拦截期间仍允许调用（登录/游客登录/退出） */
    authBypass?: boolean
    /** Optional caller cancel; combined with timeout when both are set. */
    signal?: AbortSignal
}

const DEFAULT_FETCH_TIMEOUT_MS = 60_000

function fetchSignal(timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): AbortSignal | undefined {
    if (timeoutMs <= 0) return undefined
    return AbortSignal.timeout(timeoutMs)
}

function combineAbortSignals(
    timeoutMs: number | undefined,
    userSignal?: AbortSignal,
): AbortSignal | undefined {
    const timeoutSignal = fetchSignal(timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS)
    if (timeoutSignal && userSignal) {
        const anyFactory = (AbortSignal as typeof AbortSignal & {
            any?: (signals: AbortSignal[]) => AbortSignal
        }).any
        if (typeof anyFactory === 'function') {
            return anyFactory.call(AbortSignal, [timeoutSignal, userSignal])
        }
        // Older CEF/Chromium without AbortSignal.any — abort when either fires.
        return mergeAbortSignalsFallback([timeoutSignal, userSignal])
    }
    return userSignal ?? timeoutSignal
}

/** Polyfill for environments without AbortSignal.any (keeps timeout + cancel). */
function mergeAbortSignalsFallback(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController()
    const onAbort = (source: AbortSignal) => {
        if (controller.signal.aborted) return
        try {
            controller.abort(source.reason)
        } catch {
            controller.abort()
        }
    }
    for (const signal of signals) {
        if (signal.aborted) {
            onAbort(signal)
            break
        }
        signal.addEventListener('abort', () => onAbort(signal), {once: true})
    }
    return controller.signal
}

const IDEMPOTENT_GET_RETRY_MAX = 2
const IDEMPOTENT_GET_RETRY_BASE_MS = 200

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableGetStatus(status: number): boolean {
    return status === 502 || status === 503 || status === 504
}

function isRetryableTransportError(error: unknown): boolean {
    if (isAbortError(error) || isTimeoutError(error)) return false
    return true
}

function errorName(error: unknown): string {
    if (!error || typeof error !== 'object') return ''
    return String((error as {name?: unknown}).name ?? '')
}

/** User-cancelled / superseded fetch — do not map to backend-offline. */
function isAbortError(error: unknown): boolean {
    return errorName(error) === 'AbortError'
}

/** AbortSignal.timeout() rejection. */
function isTimeoutError(error: unknown): boolean {
    return errorName(error) === 'TimeoutError'
}

function rejectFetchTransportError(error: unknown, options?: HttpRequestOptions): never {
    if (isAbortError(error)) {
        throw error
    }
    if (isTimeoutError(error)) {
        const apiError = new ApiError(HTTP_TIMEOUT)
        notifyApiError(apiError, options)
        throw apiError
    }
    const apiError = new ApiError(HTTP_NOT_READY)
    notifyApiError(apiError, options)
    throw apiError
}

function bindSessionGuardOptions(options?: HttpRequestOptions): HttpRequestOptions & SessionGuardOptions {
    return {
        ...options,
        // Capture at send-time so a later login cannot be cleared by this response's 401.
        requestSessionId: readActiveSessionId(),
    }
}

async function readApiPayload<T>(
    response: Response,
    options?: HttpRequestOptions & SessionGuardOptions,
): Promise<ApiResponse<T>> {
    try {
        return (await response.json()) as ApiResponse<T>
    } catch {
        const message = response.ok ? HTTP_NOT_READY : `HTTP ${response.status}`
        const error = new ApiError(message)
        notifyUnauthorizedIfNeeded(error, options)
        throw error
    }
}

function rejectApiError(
    payload: ApiResponse<unknown>,
    options?: HttpRequestOptions & SessionGuardOptions,
): never {
    const message = payload.msg?.trim() || HTTP_NOT_READY
    const error = new ApiError(message, payload.data)
    notifyUnauthorizedIfNeeded(error, options)
    notifyApiError(error, options)
    throw error
}

async function ensureApiSuccess<T>(
    response: Response,
    options?: HttpRequestOptions & SessionGuardOptions,
): Promise<ApiResponse<T>> {
    const payload = await readApiPayload<T>(response, options)
    if (!response.ok || payload.code !== 0) {
        rejectApiError(payload, options)
    }
    return payload
}

async function runFetch<T>(
    execute: (signal?: AbortSignal) => Promise<Response>,
    options?: HttpRequestOptions,
    retry?: {attempts: number},
): Promise<T> {
    maybeRejectBlockedRequest(options)
    const guarded = bindSessionGuardOptions(options)
    const maxAttempts = Math.max(0, retry?.attempts ?? 0)
    let attempt = 0
    let lastError: unknown

    while (attempt <= maxAttempts) {
        const signal = combineAbortSignals(options?.timeoutMs, options?.signal)
        let response: Response
        try {
            response = await execute(signal)
        } catch (error) {
            lastError = error
            if (attempt < maxAttempts && isRetryableTransportError(error) && !options?.signal?.aborted) {
                await sleep(IDEMPOTENT_GET_RETRY_BASE_MS * (attempt + 1))
                attempt += 1
                continue
            }
            rejectFetchTransportError(error, options)
        }

        if (
            attempt < maxAttempts
            && isRetryableGetStatus(response.status)
            && !options?.signal?.aborted
        ) {
            await sleep(IDEMPOTENT_GET_RETRY_BASE_MS * (attempt + 1))
            attempt += 1
            continue
        }

        try {
            const payload = await ensureApiSuccess<T>(response, guarded)
            return payload.data
        } catch (error) {
            if (error instanceof ApiError) {
                throw error
            }
            const apiError = new ApiError(resolveApiErrorMessage(error))
            notifyApiError(apiError, options)
            throw apiError
        }
    }

    rejectFetchTransportError(lastError ?? new Error(HTTP_NOT_READY), options)
}

export function requireBaseUrl(): string {
    return readApiBaseUrl()
}

/** Absolute or same-origin API URL for fetch/SSE (single source for stream clients). */
export function buildApiUrl(path: string): string {
    const baseUrl = readApiBaseUrl()
    return baseUrl ? `${baseUrl}${path}` : path
}

function buildUrl(path: string): string {
    return buildApiUrl(path)
}

/** 会话 / 活动项目 / scope=all（供 SSE、Explorer 子树等复用）。 */
export function buildSessionHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {...(extra ?? {})}
    if (typeof localStorage === 'undefined') return headers
    const sessionId = localStorage.getItem(SESSION_KEY)
    if (sessionId) headers['X-DW-Session-Id'] = sessionId
    const projectId = localStorage.getItem('dw-cli-active-project-id')
    if (projectId) headers['X-DataWise-Project-Id'] = projectId
    if (localStorage.getItem('dw-cli-project-scope-all') === '1') {
        headers['X-DataWise-Project-Scope'] = 'all'
    }
    return headers
}

function sessionHeaders(): Record<string, string> {
    return buildSessionHeaders()
}

function mergeHeaders(headers?: Record<string, string>): Record<string, string> {
    return {...sessionHeaders(), ...headers}
}

export async function postForm<T>(
    path: string,
    body: URLSearchParams,
    options?: HttpRequestOptions,
): Promise<T> {
    return runFetch(
        (signal) =>
            fetch(buildUrl(path), {
                method: 'POST',
                headers: mergeHeaders({'Content-Type': 'application/x-www-form-urlencoded'}),
                body,
                credentials: 'include',
                signal,
            }),
        options,
    )
}

/** multipart/form-data — do not set Content-Type (browser adds boundary). */
export async function postMultipart<T>(
    path: string,
    body: FormData,
    options?: HttpRequestOptions,
): Promise<T> {
    return runFetch(
        (signal) =>
            fetch(buildUrl(path), {
                method: 'POST',
                headers: mergeHeaders(),
                body,
                credentials: 'include',
                signal,
            }),
        options,
    )
}

export async function postJson<T>(
    path: string,
    body: unknown,
    options?: HttpRequestOptions,
): Promise<T> {
    return runFetch(
        (signal) =>
            fetch(buildUrl(path), {
                method: 'POST',
                headers: mergeHeaders({'Content-Type': 'application/json'}),
                body: JSON.stringify(body),
                credentials: 'include',
                signal,
            }),
        options,
    )
}

export async function getJson<T>(
    path: string,
    query?: Record<string, string | undefined>,
    options?: HttpRequestOptions,
): Promise<T> {
    const params = new URLSearchParams()
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value != null) params.set(key, value)
        }
    }
    const qs = params.toString()
    let url = buildUrl(path)
    if (qs) {
        url += path.includes('?') ? `&${qs}` : `?${qs}`
    }
    return runFetch(
        (signal) =>
            fetch(url, {
                method: 'GET',
                headers: sessionHeaders(),
                credentials: 'include',
                signal,
            }),
        options,
        {attempts: IDEMPOTENT_GET_RETRY_MAX},
    )
}

export async function putJson<T>(
    path: string,
    body: unknown,
    options?: HttpRequestOptions,
): Promise<T> {
    return runFetch(
        (signal) =>
            fetch(buildUrl(path), {
                method: 'PUT',
                headers: mergeHeaders({'Content-Type': 'application/json'}),
                body: JSON.stringify(body),
                credentials: 'include',
                signal,
            }),
        options,
    )
}

export async function deleteJson<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return runFetch(
        (signal) =>
            fetch(buildUrl(path), {
                method: 'DELETE',
                headers: sessionHeaders(),
                credentials: 'include',
                signal,
            }),
        options,
    )
}

/** Download a binary/text attachment (non-ApiResponse body). */
export async function downloadAttachment(
    path: string,
    query?: Record<string, string | undefined>,
    options?: HttpRequestOptions,
): Promise<{blob: Blob; fileName: string | null}> {
    maybeRejectBlockedRequest(options)
    const guarded = bindSessionGuardOptions(options)
    const params = new URLSearchParams()
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value != null) params.set(key, value)
        }
    }
    const qs = params.toString()
    const url = buildUrl(path) + (qs ? `?${qs}` : '')
    const signal = combineAbortSignals(options?.timeoutMs, options?.signal)
    let response: Response
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: sessionHeaders(),
            credentials: 'include',
            signal,
        })
    } catch (error) {
        rejectFetchTransportError(error, options)
    }
    if (!response.ok) {
        const error = new ApiError(`HTTP ${response.status}`)
        notifyUnauthorizedIfNeeded(error, guarded)
        notifyApiError(error, options)
        throw error
    }
    const disposition = response.headers.get('Content-Disposition') || ''
    const match = /filename="?([^";]+)"?/i.exec(disposition)
    const blob = await response.blob()
    return {blob, fileName: match?.[1] ?? null}
}

export function notReady<T>(): Promise<T> {
    return Promise.reject(new Error(HTTP_NOT_READY))
}
