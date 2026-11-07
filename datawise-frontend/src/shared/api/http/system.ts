import type {ApiResponse, SystemMetricsSnapshot} from '@/shared/api/types'
import type {
    DeploymentCheckDto,
    DeploymentProfileDto,
    HealthStatusDto,
    LegacyConfigMigrationItemDto,
    LegacyConfigMigrationStatusDto,
    SecretsStatusDto,
} from '@/shared/api/generated'
import {readApiBaseUrl} from '@/shared/api/mode'
import {API_PATHS} from '@/shared/api/http/paths'
import {getJson, postJson} from '@/shared/api/http/request'

const HEALTH_TIMEOUT_MS = 5000

export interface HealthStatus {
    ok: boolean
    latencyMs: number
    serverVersion?: string
    serverTime?: string
    scriptsDir?: string
    configDir?: string
}

export interface HealthSnapshot {
    endpoint: string
    result: HealthStatus | null
}

function buildHealthUrl(baseUrl = readApiBaseUrl()): string {
    return baseUrl ? `${baseUrl}${API_PATHS.health}` : API_PATHS.health
}

/** 展示用后端地址 */
export function resolveBackendEndpointLabel(baseUrl = readApiBaseUrl()): string {
    if (baseUrl) return baseUrl
    if (typeof window !== 'undefined') {
        return `${window.location.origin}/api`
    }
    return '/api'
}

export async function pingHealthAt(baseUrl: string): Promise<HealthSnapshot> {
    const normalized = baseUrl.trim().replace(/\/$/, '')
    const endpoint = resolveBackendEndpointLabel(normalized)
    const url = buildHealthUrl(normalized)
    const started = performance.now()

    try {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        })
        const latencyMs = Math.round(performance.now() - started)
        const payload = (await response.json()) as ApiResponse<HealthStatusDto>

        if (!response.ok || payload.code !== 0 || payload.data?.status !== 'ok') {
            return {endpoint, result: {ok: false, latencyMs}}
        }

        return {
            endpoint,
            result: {
                ok: true,
                latencyMs,
                serverVersion: payload.data.version,
                serverTime: payload.data.serverTime,
                scriptsDir: payload.data.scriptsDir,
                configDir: payload.data.configDir,
            },
        }
    } catch {
        return {
            endpoint,
            result: {
                ok: false,
                latencyMs: Math.round(performance.now() - started),
            },
        }
    }
}

export async function pingHealth(): Promise<HealthSnapshot> {
    return pingHealthAt(readApiBaseUrl())
}

export interface SecretsStatus {
    masterKeySource: string
    masterKeyFromEnvironment: boolean
    supportedSecretRefSchemes: string[]
    secretRefHint?: string
}

function mapSecretsStatus(wire: SecretsStatusDto): SecretsStatus {
    return {
        masterKeySource: String(wire.masterKeySource ?? ''),
        masterKeyFromEnvironment: Boolean(wire.masterKeyFromEnvironment),
        supportedSecretRefSchemes: [...(wire.supportedSecretRefSchemes ?? [])],
        secretRefHint: wire.secretRefHint,
    }
}

function mapDeploymentCheck(wire: DeploymentCheckDto): import('@/shared/api/types').DeploymentCheck {
    return {
        id: String(wire.id ?? ''),
        currentValue: String(wire.currentValue ?? ''),
        recommendedValue: String(wire.recommendedValue ?? ''),
        status: String(wire.status ?? ''),
        docsHint: wire.docsHint,
    }
}

function mapDeploymentProfile(
    wire: DeploymentProfileDto,
): import('@/shared/api/types').DeploymentProfileSnapshot {
    return {
        activeProfiles: [...(wire.activeProfiles ?? [])],
        mode: String(wire.mode ?? ''),
        checks: (wire.checks ?? []).map(mapDeploymentCheck),
        okCount: Number(wire.okCount ?? 0),
        warnCount: Number(wire.warnCount ?? 0),
        infoCount: Number(wire.infoCount ?? 0),
        pythonSimulated: Boolean(wire.pythonSimulated),
    }
}

function mapMigrationItem(
    wire: LegacyConfigMigrationItemDto,
): import('@/shared/api/types').LegacyConfigMigrationItem {
    return {
        legacyRelativePath: String(wire.legacyRelativePath ?? ''),
        targetRelativePath: String(wire.targetRelativePath ?? ''),
        kind: String(wire.kind ?? ''),
    }
}

function mapMigrationStatus(
    wire: LegacyConfigMigrationStatusDto,
): import('@/shared/api/types').LegacyConfigMigrationStatus {
    return {
        pendingCount: Number(wire.pendingCount ?? 0),
        pending: (wire.pending ?? []).map(mapMigrationItem),
        migrated: (wire.migrated ?? []).map(mapMigrationItem),
    }
}

export function createHttpSystemApi() {
    return {
        ping: pingHealth,
        pingAt: pingHealthAt,
        resolveEndpointLabel: resolveBackendEndpointLabel,
        fetchMetrics: () => getJson<SystemMetricsSnapshot>(API_PATHS.metrics),
        fetchDeploymentProfile: async () =>
            mapDeploymentProfile(await getJson<DeploymentProfileDto>(API_PATHS.deploymentProfile)),
        fetchConfigMigrationStatus: async () =>
            mapMigrationStatus(
                await getJson<LegacyConfigMigrationStatusDto>(API_PATHS.configMigration),
            ),
        applyConfigMigration: async () =>
            mapMigrationStatus(
                await postJson<LegacyConfigMigrationStatusDto>(API_PATHS.configMigrationApply, {}),
            ),
        fetchSecretsStatus: async () =>
            mapSecretsStatus(await getJson<SecretsStatusDto>(API_PATHS.secrets)),
    }
}
