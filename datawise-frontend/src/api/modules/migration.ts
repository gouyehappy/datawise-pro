import {api} from '@/shared/api'
import type {
    TableMigrationBatchRequest,
    TableMigrationPreflightRequest,
    TableMigrationRequest,
    TableMigrationRowDiffRequest,
} from '@/shared/api/types'

export const migrationApi = {
    migrateTable: (request: TableMigrationRequest) => api.migration.migrateTable(request),
    migrateTablesBatch: (request: TableMigrationBatchRequest) => api.migration.migrateTablesBatch(request),
    preflight: (request: TableMigrationPreflightRequest) => api.migration.preflight(request),
    rowDiff: (request: TableMigrationRowDiffRequest) => api.migration.rowDiff(request),
    getJob: (jobId: string) => api.migration.getJob(jobId),
    startJob: (request: TableMigrationBatchRequest) => api.migration.startJob(request),
    pauseJob: (jobId: string) => api.migration.pauseJob(jobId),
    cancelJob: (jobId: string) => api.migration.cancelJob(jobId),
    resumeJob: (jobId: string) => api.migration.resumeJob(jobId),
}
