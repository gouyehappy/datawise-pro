/**
 * T-SPEC-1：专项工作台运行时探测（只收窄 T-CAP-1 声明，不放宽）。
 */
import {explorerApi} from '@/api'
import {isSpecializedSurface} from '@/shared/capabilities/supports-connection-feature'
import {resolveApiErrorMessage} from '@/shared/api'

export type CapabilityProbeStatus = 'supported' | 'unsupported' | 'unknown' | 'error'

/** 专项子能力键（运行时）；声明层仍以 specializedSurface + 未来矩阵扩展为准。 */
export type SpecializedCapabilityKey =
    | 'surface'
    | 'browse'
    | 'mutate'
    | 'helm'
    | 'nativeCommand'

export interface CapabilityProbeResult {
    dbType: string
    connectionId: string
    capabilities: Partial<Record<SpecializedCapabilityKey, CapabilityProbeStatus>>
    reasons?: Partial<Record<SpecializedCapabilityKey, string>>
    probedAt: number
}

export type CapabilityProbeInput = {
    connectionId: string
    dbType: string
}

function ok(
    input: CapabilityProbeInput,
    capabilities: CapabilityProbeResult['capabilities'],
    reasons?: CapabilityProbeResult['reasons'],
): CapabilityProbeResult {
    return {
        dbType: input.dbType,
        connectionId: input.connectionId,
        capabilities,
        reasons,
        probedAt: Date.now(),
    }
}

function failSurface(input: CapabilityProbeInput, message: string): CapabilityProbeResult {
    return ok(
        input,
        {surface: 'error', browse: 'error', mutate: 'unknown'},
        {surface: message, browse: message},
    )
}

async function probeKafka(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    try {
        await explorerApi.fetchKafkaClusterInfo(input.connectionId)
        return ok(input, {
            surface: 'supported',
            browse: 'supported',
            // ACL 细节未知：不承诺 produce
            mutate: 'unknown',
        })
    } catch (error) {
        return failSurface(input, resolveApiErrorMessage(error) || 'Kafka cluster unreachable')
    }
}

async function probeRedis(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    try {
        await explorerApi.fetchRedisKeysScan(input.connectionId, {pattern: '*', count: 1})
        return ok(input, {
            surface: 'supported',
            browse: 'supported',
            nativeCommand: 'unknown',
            mutate: 'unknown',
        })
    } catch (error) {
        return failSurface(input, resolveApiErrorMessage(error) || 'Redis unreachable')
    }
}

async function probeKubernetes(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    const capabilities: CapabilityProbeResult['capabilities'] = {
        surface: 'unknown',
        browse: 'unknown',
        helm: 'unknown',
        mutate: 'unknown',
    }
    const reasons: CapabilityProbeResult['reasons'] = {}
    try {
        await explorerApi.fetchK8sClusterInfo(input.connectionId)
        capabilities.surface = 'supported'
        capabilities.browse = 'supported'
    } catch (error) {
        const message = resolveApiErrorMessage(error) || 'Kubernetes unreachable'
        return failSurface(input, message)
    }
    try {
        await explorerApi.fetchK8sHelmReleases(input.connectionId, '', {limit: 1})
        capabilities.helm = 'supported'
    } catch (error) {
        capabilities.helm = 'unsupported'
        reasons.helm = resolveApiErrorMessage(error) || 'Helm unavailable'
    }
    return ok(input, capabilities, Object.keys(reasons).length ? reasons : undefined)
}

async function probeNacos(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    try {
        await explorerApi.fetchNacosInfo(input.connectionId)
        return ok(input, {surface: 'supported', browse: 'supported', mutate: 'unknown'})
    } catch (error) {
        return failSurface(input, resolveApiErrorMessage(error) || 'Nacos unreachable')
    }
}

async function probePolaris(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    try {
        await explorerApi.fetchPolarisInfo(input.connectionId)
        return ok(input, {surface: 'supported', browse: 'supported', mutate: 'unknown'})
    } catch (error) {
        return failSurface(input, resolveApiErrorMessage(error) || 'Polaris unreachable')
    }
}

async function probeYarn(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    try {
        await explorerApi.fetchYarnClusterInfo(input.connectionId)
        return ok(input, {surface: 'supported', browse: 'supported', mutate: 'unknown'})
    } catch (error) {
        return failSurface(input, resolveApiErrorMessage(error) || 'YARN unreachable')
    }
}

async function probeJenkins(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    try {
        await explorerApi.fetchJenkinsInfo(input.connectionId)
        return ok(input, {surface: 'supported', browse: 'supported', mutate: 'unknown'})
    } catch (error) {
        return failSurface(input, resolveApiErrorMessage(error) || 'Jenkins unreachable')
    }
}

async function probeElasticsearch(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    try {
        await explorerApi.fetchElasticsearchIndices(input.connectionId)
        return ok(input, {surface: 'supported', browse: 'supported', mutate: 'unknown'})
    } catch (error) {
        return failSurface(input, resolveApiErrorMessage(error) || 'Elasticsearch unreachable')
    }
}

const RUNNERS: Record<string, (input: CapabilityProbeInput) => Promise<CapabilityProbeResult>> = {
    kafka: probeKafka,
    redis: probeRedis,
    kubernetes: probeKubernetes,
    nacos: probeNacos,
    polaris: probePolaris,
    yarn: probeYarn,
    jenkins: probeJenkins,
    elasticsearch: probeElasticsearch,
}

/** 对专项引擎跑一次轻量探测；非专项返回 surface=unsupported。 */
export async function runCapabilityProbe(input: CapabilityProbeInput): Promise<CapabilityProbeResult> {
    const dbType = (input.dbType || '').trim().toLowerCase()
    if (!input.connectionId || !dbType) {
        return ok(
            {connectionId: input.connectionId || '', dbType},
            {surface: 'unsupported'},
            {surface: 'missing connection'},
        )
    }
    if (!isSpecializedSurface(dbType)) {
        return ok(input, {surface: 'unsupported'}, {surface: 'not a specialized surface'})
    }
    const runner = RUNNERS[dbType]
    if (!runner) {
        return ok(input, {surface: 'unknown', browse: 'unknown', mutate: 'unknown'})
    }
    return runner({...input, dbType})
}

/**
 * 矩阵 specializedSurface ∧ 探测状态。
 * unsupported/error → false；unknown/supported/缺省 → true（缺省不阻断，避免误伤）。
 */
export function isSpecializedCapabilityLive(
    probe: CapabilityProbeResult | null | undefined,
    key: SpecializedCapabilityKey,
): boolean {
    if (!probe) return true
    if (!isSpecializedSurface(probe.dbType)) return false
    const status = probe.capabilities[key]
    if (status === 'unsupported' || status === 'error') return false
    return true
}

export function specializedCapabilityReason(
    probe: CapabilityProbeResult | null | undefined,
    key: SpecializedCapabilityKey,
): string | undefined {
    if (!probe) return undefined
    if (isSpecializedCapabilityLive(probe, key)) return undefined
    return probe.reasons?.[key] || probe.reasons?.surface
}
