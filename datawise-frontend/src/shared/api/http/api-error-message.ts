import {ApiError, HTTP_NOT_READY} from '@/shared/api/http/request'
import {
    parseDatasourceNotAvailableType,
    stableApiErrorI18nKey,
} from '@/shared/api/http/api-error-codes'

/** 将 API / 网络错误转为可展示文案 */
export function resolveApiErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        const message = error.message?.trim()
        return message || HTTP_NOT_READY
    }
    if (error instanceof Error) {
        const message = error.message?.trim()
        return message || HTTP_NOT_READY
    }
    return HTTP_NOT_READY
}

function extractStableErrorCode(error: unknown): string | null {
    if (error instanceof ApiError && error.data && typeof error.data === 'object') {
        const code = (error.data as {errorCode?: unknown}).errorCode
        if (typeof code === 'string' && code.trim()) {
            const trimmed = code.trim()
            if (trimmed === 'DATASOURCE_NOT_AVAILABLE') {
                const dbType = (error.data as {dbType?: unknown}).dbType
                if (typeof dbType === 'string' && dbType.trim()) {
                    return `DATASOURCE_NOT_AVAILABLE: ${dbType.trim()}`
                }
            }
            return trimmed
        }
    }
    if (error instanceof ApiError) {
        return error.message?.trim() || null
    }
    if (error instanceof Error) {
        return error.message?.trim() || null
    }
    return null
}

function applyDisplayTemplate(template: string, raw: string, code: string | null): string {
    const type = parseDatasourceNotAvailableType(code) || parseDatasourceNotAvailableType(raw)
    if (!template.includes('{type}')) {
        return template
    }
    if (type) {
        return template.split('{type}').join(type)
    }
    // No type detail — drop the placeholder phrasing
    return template
        .split('{type} 连接器').join('所需连接器')
        .split('{type} connector').join('The required connector')
        .split('{type}').join('')
        .replace(/\s{2,}/g, ' ')
        .trim()
}

/** 将稳定错误码映射为本地化文案；驱动/SQL 执行类优先展示后端详情。 */
export function resolveDisplayApiErrorMessage(
    error: unknown,
    translate: (key: string) => string,
): string {
    const raw = resolveApiErrorMessage(error)
    const code = extractStableErrorCode(error)
    const i18nKey = stableApiErrorI18nKey(code) || stableApiErrorI18nKey(raw)
    if (i18nKey) {
        const localized = translate(i18nKey)
        if (localized && localized !== i18nKey) {
            // SQL / 驱动失败：后端 message 通常含库端真实原因，比短码更有用
            if (shouldPreferRawDetail(code, raw)) {
                return raw
            }
            return applyDisplayTemplate(localized, raw, code)
        }
    }
    return raw
}

/** 后端已给出可读详情时，不要用短 i18n 盖掉（如「SQL 执行失败」）。 */
function shouldPreferRawDetail(code: string | null, raw: string): boolean {
    if (!raw.trim()) return false
    if (raw === code) return false
    if (/^(SQL execution failed|Request failed|IO error|Internal error|Bad request|Invalid request)$/i.test(raw)) {
        return false
    }
    // Backend already localized (e.g. K8s RBAC) — keep it over short error-code labels.
    if (/[\u4e00-\u9fff]/.test(raw)) return true

    return (
        code === 'JDBC_DRIVER_DOWNLOAD_FAILED'
        || code === 'JDBC_DRIVER_LOAD_FAILED'
        || code === 'SQL_EXECUTION_FAILED'
        || code === 'SQL_QUERY_TIMEOUT'
        || code === 'DATABASE_CONNECTION_FAILED'
        || code === 'BAD_REQUEST'
    )
}

/**
 * 业务 catch 友好展示：优先稳定码本地化，否则回退到业务 fallback i18n。
 * 避免把 `PERMISSION_DENIED` / 英文开发态句直接弹给用户。
 */
export function resolveCaughtApiErrorMessage(
    error: unknown,
    translate: (key: string) => string,
    fallbackKey: string,
): string {
    const raw = resolveApiErrorMessage(error)
    const display = resolveDisplayApiErrorMessage(error, translate)
    if (display && display !== raw) {
        return display
    }
    // 仍是 ALL_CAPS 稳定码，或英文 HTTP 开发句 → 用 fallback
    if (
        /^[A-Z][A-Z0-9_]{2,}(?::[\s\S]*)?$/.test(raw)
        || raw.startsWith('HTTP API request failed')
        || /^HTTP \d{3}$/.test(raw)
    ) {
        const fallback = translate(fallbackKey)
        return fallback && fallback !== fallbackKey ? fallback : raw
    }
    // 可读业务消息（中文或已产品化英文）保留；否则 fallback
    if (raw && raw !== HTTP_NOT_READY) {
        return raw
    }
    const fallback = translate(fallbackKey)
    return fallback && fallback !== fallbackKey ? fallback : raw
}
