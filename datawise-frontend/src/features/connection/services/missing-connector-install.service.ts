import {ApiError} from '@/shared/api/http/request'
import {resolveApiErrorMessage, resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import {parseDatasourceNotAvailableType} from '@/shared/api/http/api-error-codes'
import {
    installConnectorsWithDrivers,
    type ConnectorDriverInstallProgress,
} from '@/features/settings/services/install-connectors-with-drivers.service'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {t} from '@/i18n'

/** 从测连 / 打开连接错误中解析缺失连接器 id */
export function extractDatasourceMissingId(error: unknown, fallbackDbType = ''): string | null {
    if (error instanceof ApiError && error.data && typeof error.data === 'object') {
        const data = error.data as {errorCode?: unknown; dbType?: unknown}
        const code = typeof data.errorCode === 'string' ? data.errorCode.trim() : ''
        if (code === 'DATASOURCE_NOT_AVAILABLE' || code.startsWith('DATASOURCE_NOT_AVAILABLE:')) {
            if (typeof data.dbType === 'string' && data.dbType.trim()) {
                return data.dbType.trim().toLowerCase()
            }
            const fromCode = code.includes(':') ? code.split(':')[1]?.trim() : ''
            if (fromCode) return fromCode.toLowerCase()
            return fallbackDbType.trim().toLowerCase() || null
        }
    }
    const raw = resolveApiErrorMessage(error)
    if (raw.startsWith('DATASOURCE_NOT_AVAILABLE')) {
        const fromMsg = raw.includes(':') ? raw.split(':')[1]?.trim() : ''
        return (fromMsg || fallbackDbType).trim().toLowerCase() || null
    }
    return null
}

let installInFlight: Promise<boolean> | null = null

/**
 * 缺连接器时就地安装并可选回调重试（Explorer 打开 / 测连共用）。
 * @returns true 表示已安装（调用方应重试）；false 表示非缺驱动或安装失败
 */
export async function installMissingConnectorIfNeeded(
    error: unknown,
    options?: {
        fallbackDbType?: string
        onProgressToast?: boolean
    },
): Promise<boolean> {
    const connectorId = extractDatasourceMissingId(error, options?.fallbackDbType ?? '')
    if (!connectorId) return false

    if (installInFlight) return installInFlight

    const layout = useLayoutStore()
    const catalog = useDatasourceCatalogStore()
    const label =
        parseDatasourceNotAvailableType(`DATASOURCE_NOT_AVAILABLE: ${connectorId}`)
        || catalog.items.find((item) => item.id === connectorId)?.label
        || connectorId

    installInFlight = (async () => {
        layout.showToast(t('explorer.missingConnector.installing', {type: label}), {variant: 'info'})
        try {
            await installConnectorsWithDrivers([connectorId], {
                withDrivers: true,
                onProgress: (progress: ConnectorDriverInstallProgress) => {
                    if (options?.onProgressToast === false) return
                    if (progress.phase === 'connectors') {
                        layout.showToast(
                            t('explorer.missingConnector.progressConnector', {
                                current: progress.index + 1,
                                total: progress.total,
                                id: progress.connectorId || connectorId,
                            }),
                            {variant: 'info', durationMs: 2500},
                        )
                    } else {
                        layout.showToast(
                            t('explorer.missingConnector.progressDriver', {
                                current: progress.index + 1,
                                total: progress.total,
                            }),
                            {variant: 'info', durationMs: 2500},
                        )
                    }
                },
            })
            catalog.loaded = false
            await catalog.ensureLoaded().catch(() => undefined)
            layout.showSuccessToast(t('explorer.missingConnector.installed', {type: label}))
            return true
        } catch (installError) {
            const message =
                resolveDisplayApiErrorMessage(installError, (key) => String(t(key)))
                || resolveApiErrorMessage(installError)
                || t('explorer.missingConnector.failed')
            layout.showErrorToast(message)
            return false
        } finally {
            installInFlight = null
        }
    })()

    return installInFlight
}
