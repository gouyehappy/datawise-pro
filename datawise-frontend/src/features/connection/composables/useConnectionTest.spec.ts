import {beforeEach, describe, expect, it, vi} from 'vitest'
import {defineComponent} from 'vue'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createPinia, setActivePinia} from 'pinia'
import type {ConnectionConfig} from '@/core/types'
import {ApiError} from '@/shared/api/http/api-error'

const testMock = vi.fn()
const installMock = vi.fn()

vi.mock('@/api', () => ({
    connectionApi: {
        test: (...args: unknown[]) => testMock(...args),
    },
}))

vi.mock('@/features/settings/services/install-connectors-with-drivers.service', () => ({
    installConnectorsWithDrivers: (...args: unknown[]) => installMock(...args),
}))

vi.mock('@/features/explorer/services/register-connection-health.service', () => ({
    registerConnectionHealthCheck: vi.fn(),
}))

vi.mock('@/features/datasource/stores/datasource-catalog', () => ({
    useDatasourceCatalogStore: () => ({
        items: [{id: 'mysql', label: 'MySQL'}],
        loaded: true,
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
    }),
}))

import {useConnectionTest} from '@/features/connection/composables/useConnectionTest'

let hook: ReturnType<typeof useConnectionTest> | null = null

function payload(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
    return {
        dbType: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: '',
        ...overrides,
    } as ConnectionConfig
}

function mountHook(getPayload: () => ConnectionConfig) {
    setActivePinia(createPinia())
    const i18n = createI18n({
        locale: 'en',
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        messages: {
            en: {
                connection: {
                    testHostRequired: 'host required',
                    testUserRequired: 'user required',
                    testKubeconfigRequired: 'kubeconfig required',
                    testBearerTokenRequired: 'token required',
                    testGuestNotAllowed: 'guest blocked',
                    testFailed: 'test failed',
                    testSuccess: '{message} ({latency}ms)',
                    testConnectorMissing: 'missing {type}',
                    installingConnector: 'installing {type}',
                    installingConnectorHint: 'installing…',
                    installProgressConnector: 'connector {current}/{total} {id}',
                    installProgressDriver: 'driver {current}/{total}',
                    installConnectorDone: 'installed, retest',
                    installConnectorFailed: 'install failed',
                },
            },
        },
    })
    const Host = defineComponent({
        setup() {
            hook = useConnectionTest(getPayload)
            return () => null
        },
    })
    return mount(Host, {
        global: {plugins: [createPinia(), i18n]},
    })
}

describe('useConnectionTest missing connector install', () => {
    beforeEach(() => {
        hook = null
        testMock.mockReset()
        installMock.mockReset()
    })

    it('surfaces install CTA when test returns DATASOURCE_NOT_AVAILABLE', async () => {
        testMock.mockRejectedValueOnce(
            new ApiError('DATASOURCE_NOT_AVAILABLE: mysql', {
                errorCode: 'DATASOURCE_NOT_AVAILABLE',
                dbType: 'mysql',
            }),
        )
        mountHook(() => payload())
        await hook!.testConnection()
        expect(hook!.testOk.value).toBe(false)
        expect(hook!.missingConnectorId.value).toBe('mysql')
        expect(hook!.missingConnectorLabel.value).toBeTruthy()
        expect(hook!.testMessage.value).toContain('missing')
    })

    it('installs missing connector then retries test', async () => {
        testMock
            .mockRejectedValueOnce(
                new ApiError('DATASOURCE_NOT_AVAILABLE', {
                    errorCode: 'DATASOURCE_NOT_AVAILABLE',
                    dbType: 'mysql',
                }),
            )
            .mockResolvedValueOnce({ok: true, message: 'ok', latencyMs: 12})
        installMock.mockResolvedValueOnce({connectors: {}, drivers: []})

        mountHook(() => payload())
        await hook!.testConnection()
        expect(hook!.missingConnectorId.value).toBe('mysql')

        await hook!.installMissingConnectorAndRetry()
        expect(installMock).toHaveBeenCalledWith(
            ['mysql'],
            expect.objectContaining({withDrivers: true}),
        )
        expect(testMock).toHaveBeenCalledTimes(2)
        expect(hook!.testOk.value).toBe(true)
        expect(hook!.missingConnectorId.value).toBeNull()
    })
})
