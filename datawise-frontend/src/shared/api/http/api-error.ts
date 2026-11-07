/** 带结构化 data 的 API 错误（如 SQL errorLine） */
export class ApiError extends Error {
    readonly data?: unknown

    constructor(message: string, data?: unknown) {
        super(message)
        this.name = 'ApiError'
        this.data = data
    }
}

export function isUnauthorizedApiError(error: unknown): boolean {
    if (!(error instanceof ApiError)) return false
    const message = error.message.trim()
    if (message === 'UNAUTHORIZED' || message === 'HTTP 401') {
        return true
    }
    if (error.data && typeof error.data === 'object') {
        const code = (error.data as {errorCode?: unknown}).errorCode
        return code === 'UNAUTHORIZED'
    }
    return false
}

/** Server blocked a production write that needs team approval (HTTP 403). */
export function isProductionApprovalRequiredError(error: unknown): boolean {
    const code = 'SQL_PRODUCTION_APPROVAL_REQUIRED'
    if (error instanceof ApiError) {
        if (error.message.trim() === code) return true
        if (error.data && typeof error.data === 'object') {
            return (error.data as {errorCode?: unknown}).errorCode === code
        }
    }
    if (error instanceof Error && error.message.includes(code)) {
        return true
    }
    return false
}

export function shouldRecoverStaleSession(error: unknown): boolean {
    return isUnauthorizedApiError(error)
}
