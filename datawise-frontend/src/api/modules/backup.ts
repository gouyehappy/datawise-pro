import {deleteJson, getJson, postJson, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {
    BackupPolicyDto,
    BackupProgressDto,
    BackupRetentionSpecDto,
    BackupRunDto,
} from '@/shared/api/generated'

export type BackupType = 'workbench' | 'database'

export interface BackupRetentionSpec {
    maxCount?: number | null
    maxAgeDays?: number | null
    maxTotalBytes?: number | null
}

export interface BackupPolicy {
    id?: string
    name: string
    type: BackupType
    enabled?: boolean
    cronExpression?: string | null
    destinationRoot?: string | null
    retention?: BackupRetentionSpec
    notifyOnFailure?: boolean
    notifyOnSuccess?: boolean
    encryption?: string
    includePlugins?: boolean
    includeDrivers?: boolean
    includeSqlHistory?: boolean
    connectionId?: string | null
    database?: string | null
    contentMode?: 'structureAndData' | 'structureOnly'
}

export interface BackupProgress {
    phase?: string
    current?: number
    total?: number
}

export interface BackupRun {
    id: string
    policyId?: string
    type: BackupType
    trigger?: string
    status: string
    startedAt?: string
    finishedAt?: string
    artifactPath?: string
    artifactId?: string
    message?: string
    progress?: BackupProgress
}

export interface BackupArtifactSummary {
    artifactId: string
    type: BackupType
    path: string
    createdAt?: string
    status?: string
    tenantId?: string
}

export interface RestoreJob {
    id?: string
    artifactId?: string
    artifactPath?: string
    type?: BackupType
    mode?: 'full' | 'connectionsOnly' | 'selectedTables'
    targetConnectionId?: string
    targetDatabase?: string
    productionAck?: boolean
    status?: string
    message?: string
    progress?: BackupProgress
    preRestoreSnapshotId?: string
    startedAt?: string
    createdAt?: string
}

export interface BackupHealth {
    freeBytes: number
    diskMinFreeBytes: number
    overduePolicies: Array<{policyId: string; name: string}>
    /** When true, schedule / retention / restore need Backup Pack (Wave 43). */
    backupPackRequired?: boolean
}

export interface BackupTableStat {
    tableName: string
    fileName?: string
    status?: string
    rowCount?: number
    sizeBytes?: number
    durationMs?: number
    sha256?: string
    error?: string
}

export interface BackupStatsDocument {
    layout?: string
    tableCount?: number
    successTables?: number
    failedTables?: number
    totalRows?: number
    totalBytes?: number
    durationMs?: number
    parallelism?: number
    tables?: BackupTableStat[]
}

function mapRetention(wire?: BackupRetentionSpecDto | null): BackupRetentionSpec | undefined {
    if (!wire) return undefined
    return {
        maxCount: wire.maxCount ?? null,
        maxAgeDays: wire.maxAgeDays ?? null,
        maxTotalBytes: wire.maxTotalBytes ?? null,
    }
}

function mapProgress(wire?: BackupProgressDto | null): BackupProgress | undefined {
    if (!wire) return undefined
    return {
        phase: wire.phase,
        current: wire.current,
        total: wire.total,
    }
}

function mapPolicy(wire: BackupPolicyDto): BackupPolicy {
    const type = wire.type === 'database' ? 'database' : 'workbench'
    const contentMode =
        wire.contentMode === 'structureOnly' ? 'structureOnly' : 'structureAndData'
    return {
        id: wire.id,
        name: String(wire.name ?? ''),
        type,
        enabled: wire.enabled,
        cronExpression: wire.cronExpression ?? null,
        destinationRoot: wire.destinationRoot ?? null,
        retention: mapRetention(wire.retention),
        notifyOnFailure: wire.notifyOnFailure,
        notifyOnSuccess: wire.notifyOnSuccess,
        encryption: wire.encryption,
        includePlugins: wire.includePlugins,
        includeDrivers: wire.includeDrivers,
        includeSqlHistory: wire.includeSqlHistory,
        connectionId: wire.connectionId ?? null,
        database: wire.database ?? null,
        contentMode,
    }
}

function mapRun(wire: BackupRunDto): BackupRun {
    const type = wire.type === 'database' ? 'database' : 'workbench'
    return {
        id: String(wire.id ?? ''),
        policyId: wire.policyId,
        type,
        trigger: wire.trigger,
        status: String(wire.status ?? ''),
        startedAt: wire.startedAt,
        finishedAt: wire.finishedAt,
        artifactPath: wire.artifactPath,
        artifactId: wire.artifactId,
        message: wire.message,
        progress: mapProgress(wire.progress),
    }
}

function toWirePolicy(policy: BackupPolicy): BackupPolicyDto {
    return {
        id: policy.id,
        name: policy.name,
        type: policy.type,
        enabled: policy.enabled,
        cronExpression: policy.cronExpression ?? undefined,
        destinationRoot: policy.destinationRoot ?? undefined,
        retention: policy.retention
            ? {
                maxCount: policy.retention.maxCount ?? undefined,
                maxAgeDays: policy.retention.maxAgeDays ?? undefined,
                maxTotalBytes: policy.retention.maxTotalBytes ?? undefined,
            }
            : undefined,
        notifyOnFailure: policy.notifyOnFailure,
        notifyOnSuccess: policy.notifyOnSuccess,
        encryption: policy.encryption,
        includePlugins: policy.includePlugins,
        includeDrivers: policy.includeDrivers,
        includeSqlHistory: policy.includeSqlHistory,
        connectionId: policy.connectionId ?? undefined,
        database: policy.database ?? undefined,
        contentMode: policy.contentMode,
    }
}

function artifactsUrl(params?: {type?: string; connectionId?: string; database?: string}): string {
    const search = new URLSearchParams()
    if (params?.type) search.set('type', params.type)
    if (params?.connectionId) search.set('connectionId', params.connectionId)
    if (params?.database) search.set('database', params.database)
    const qs = search.toString()
    return qs ? `${API_PATHS.backup.artifacts}?${qs}` : API_PATHS.backup.artifacts
}

/** Backup HTTP client — policy/run wire types from OpenAPI. */
export const backupApi = {
    listPolicies: async () =>
        (await getJson<BackupPolicyDto[]>(API_PATHS.backup.policies) ?? []).map(mapPolicy),
    createPolicy: async (policy: BackupPolicy) =>
        mapPolicy(await postJson<BackupPolicyDto>(API_PATHS.backup.policies, toWirePolicy(policy))),
    updatePolicy: async (id: string, policy: BackupPolicy) =>
        mapPolicy(
            await putJson<BackupPolicyDto>(API_PATHS.backup.policy(id), toWirePolicy(policy)),
        ),
    deletePolicy: (id: string) => deleteJson<void>(API_PATHS.backup.policy(id)),
    runPolicy: async (id: string) =>
        mapRun(await postJson<BackupRunDto>(API_PATHS.backup.policyRun(id), {})),
    startRun: async (spec: BackupPolicy) =>
        mapRun(await postJson<BackupRunDto>(API_PATHS.backup.runs, toWirePolicy(spec))),
    listRuns: async () =>
        (await getJson<BackupRunDto[]>(API_PATHS.backup.runs) ?? []).map(mapRun),
    getRun: async (id: string) => mapRun(await getJson<BackupRunDto>(API_PATHS.backup.run(id))),
    cancelRun: async (id: string) =>
        mapRun(await postJson<BackupRunDto>(API_PATHS.backup.runCancel(id), {})),
    listArtifacts: (params?: {type?: string; connectionId?: string; database?: string}) =>
        getJson<BackupArtifactSummary[]>(artifactsUrl(params)),
    getArtifact: (id: string) => getJson<Record<string, unknown>>(API_PATHS.backup.artifact(id)),
    getArtifactStats: (id: string) => getJson<BackupStatsDocument>(API_PATHS.backup.artifactStats(id)),
    deleteArtifact: (id: string) => deleteJson<void>(API_PATHS.backup.artifact(id)),
    startRestore: (job: RestoreJob) => postJson<RestoreJob>(API_PATHS.backup.restoreJobs, job),
    getRestoreJob: (id: string) => getJson<RestoreJob>(API_PATHS.backup.restoreJob(id)),
    cancelRestoreJob: (id: string) => postJson<RestoreJob>(API_PATHS.backup.restoreJobCancel(id), {}),
    health: () => getJson<BackupHealth>(API_PATHS.backup.health),
}
