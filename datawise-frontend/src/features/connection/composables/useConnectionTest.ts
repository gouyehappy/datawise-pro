import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ConnectionConfig} from '@/core/types'
import {connectionApi} from '@/api'
import {registerConnectionHealthCheck} from '@/features/explorer/services/register-connection-health.service'
import {
    resolveApiErrorMessage,
    resolveCaughtApiErrorMessage,
    resolveCaughtMessage,
} from '@/shared/api/http/api-error-message'
import {ApiError} from '@/shared/api/http/request'
import {parseDatasourceNotAvailableType} from '@/shared/api/http/api-error-codes'
import {
    installConnectorsWithDrivers,
    type ConnectorDriverInstallProgress,
} from '@/features/settings/services/install-connectors-with-drivers.service'
import {isJdbcDriverRequired} from '@/features/connection/utils/connection-defaults'
import {jdbcArtifactName, useDriverInstallStore} from '@/features/connection/stores/driver-install'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {extractDatasourceMissingId} from '@/features/connection/services/missing-connector-install.service'

/** 连接测试：校验 + 调用 api.connection.test；缺连接器时可就地安装并重试 */
export function useConnectionTest(
    getPayload: () => ConnectionConfig,
    getConnectionId?: () => string | undefined,
) {
    const {t} = useI18n()
    const catalog = useDatasourceCatalogStore()
    const testing = ref(false)
    const testMessage = ref<string | null>(null)
    const testOk = ref<boolean | null>(null)
    const missingConnectorId = ref<string | null>(null)
    const missingConnectorLabel = ref<string | null>(null)
    const installing = ref(false)
    const installProgress = ref<string | null>(null)
    /** A2-2: JDBC 安装失败后提供市场兜底 */
    const driverInstallFailed = ref(false)

    function clearInstallState() {
        missingConnectorId.value = null
        missingConnectorLabel.value = null
        installProgress.value = null
    }

    async function testConnection() {
        if (testing.value || installing.value) return
        testing.value = true
        testMessage.value = null
        clearInstallState()
        driverInstallFailed.value = false
        const payload = getPayload()

        if (!payload.host?.trim() && payload.dbType !== 'plugin') {
            testOk.value = false
            testMessage.value = t('connection.testHostRequired')
            testing.value = false
            return
        }
        if (
            payload.dbType === 'plugin'
            && (!payload.pluginId?.trim() || !payload.pluginConnectionProvider?.trim())
        ) {
            testOk.value = false
            testMessage.value = t('communityPlugin.connection.missingPlugin')
            testing.value = false
            return
        }
        if (
            payload.dbType !== 'plugin'
            && payload.dbType !== 'redis'
            && payload.dbType !== 'kudu'
            && payload.dbType !== 'kubernetes'
            && payload.dbType !== 'kafka'
            && payload.dbType !== 'yarn'
            && payload.dbType !== 'jenkins'
            && payload.dbType !== 'nacos'
            && payload.dbType !== 'polaris'
            && payload.auth !== 'NONE'
            && !payload.user?.trim()
        ) {
            testOk.value = false
            testMessage.value = t('connection.testUserRequired')
            testing.value = false
            return
        }
        if (payload.dbType === 'kubernetes' && !payload.password?.trim()) {
            testOk.value = false
            testMessage.value = payload.auth === 'kubeconfig'
                ? t('connection.testKubeconfigRequired')
                : t('connection.testBearerTokenRequired')
            testing.value = false
            return
        }

        const catalogItem = catalog.items.find((item) => item.id === payload.dbType)
        if (isJdbcDriverRequired(payload.dbType, catalogItem)) {
            const maven = payload.driver?.trim() || catalogItem?.defaultDriverMaven?.trim() || ''
            const driverClass = payload.driverClass?.trim() || catalogItem?.defaultDriverClass?.trim() || ''
            if (maven && driverClass) {
                const driverInstall = useDriverInstallStore()
                const outcome = await driverInstall.ensure(
                    maven,
                    driverClass,
                    catalogItem?.label || jdbcArtifactName(maven),
                )
                if (outcome === 'cancelled' || outcome === 'failed') {
                    testOk.value = false
                    driverInstallFailed.value = outcome === 'failed'
                    testMessage.value = outcome === 'cancelled'
                        ? t('connection.driverInstallCancelled')
                        : t('connection.driverInstallFailedHint', {
                            detail: driverInstall.error || t('connection.driverInstallFailed'),
                        })
                    testing.value = false
                    return
                }
            }
        }

        try {
            if (payload.dbType === 'plugin') {
                const {runCommunityPluginConnectionTest} = await import(
                    '@/features/community-plugin/lib/runCommunityPluginConnectionTest'
                )
                const result = await runCommunityPluginConnectionTest(payload)
                const success = result.success !== false && result.ok !== false
                testOk.value = success
                testMessage.value = success
                    ? t('connection.testSuccess', {
                        message: result.message || 'OK',
                        latency: result.latencyMs ?? 0,
                    })
                    : resolveCaughtMessage(result.message, t, 'connection.testFailed')
                if (success) {
                    const connectionId = getConnectionId?.()
                    if (connectionId) {
                        registerConnectionHealthCheck(connectionId, 'ok')
                    }
                }
                return
            }
            const result = await connectionApi.test(payload)
            testOk.value = result.ok
            testMessage.value = result.ok
                ? t('connection.testSuccess', {message: result.message, latency: result.latencyMs})
                : resolveCaughtMessage(result.message, t, 'connection.testFailed')
            if (result.ok) {
                const connectionId = getConnectionId?.()
                if (connectionId) {
                    registerConnectionHealthCheck(connectionId, 'ok')
                }
            }
        } catch (error) {
            testOk.value = false
            const raw = resolveApiErrorMessage(error)
            if (raw === 'GUEST_NOT_ALLOWED') {
                testMessage.value = t('connection.testGuestNotAllowed')
                return
            }
            const missingId = extractDatasourceMissingId(error, payload.dbType)
            if (missingId) {
                missingConnectorId.value = missingId
                const label =
                    parseDatasourceNotAvailableType(`DATASOURCE_NOT_AVAILABLE: ${missingId}`)
                    || catalog.items.find((item) => item.id === missingId)?.label
                    || missingId
                missingConnectorLabel.value = label
                testMessage.value = t('connection.testConnectorMissing', {type: label})
                return
            }
            testMessage.value = resolveCaughtApiErrorMessage(error, t, 'connection.testFailed')
        } finally {
            testing.value = false
        }
    }

    async function installMissingConnectorAndRetry() {
        const connectorId = missingConnectorId.value
        if (!connectorId || installing.value) return
        installing.value = true
        installProgress.value = t('connection.installingConnector', {
            type: missingConnectorLabel.value || connectorId,
        })
        testMessage.value = installProgress.value
        try {
            await installConnectorsWithDrivers([connectorId], {
                withDrivers: true,
                onProgress: (progress: ConnectorDriverInstallProgress) => {
                    if (progress.phase === 'connectors') {
                        installProgress.value = t('connection.installProgressConnector', {
                            current: progress.index + 1,
                            total: progress.total,
                            id: progress.connectorId || connectorId,
                        })
                    } else {
                        installProgress.value = t('connection.installProgressDriver', {
                            current: progress.index + 1,
                            total: progress.total,
                        })
                    }
                    testMessage.value = installProgress.value
                },
            })
            catalog.loaded = false
            await catalog.ensureLoaded().catch(() => undefined)
            clearInstallState()
            testMessage.value = t('connection.installConnectorDone')
        } catch (error) {
            testOk.value = false
            testMessage.value = resolveCaughtApiErrorMessage(error, t, 'connection.installConnectorFailed')
            return
        } finally {
            installing.value = false
            installProgress.value = null
        }
        await testConnection()
    }

    return {
        testing,
        testMessage,
        testOk,
        missingConnectorId,
        missingConnectorLabel,
        installing,
        installProgress,
        driverInstallFailed,
        testConnection,
        installMissingConnectorAndRetry,
    }
}
