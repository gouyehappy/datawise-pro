import type {NormalizedConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {
    buildCrossEnvResultLabel,
    clampCrossEnvSampleRowCount,
    CrossEnvCompareSideError,
    scopesReadyForCompare,
    validateCrossEnvCompareSql,
    type CrossEnvCompareExecution,
} from '@/features/cross-env-compare/services/cross-env-compare.service'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import {
    buildErrorQueryResultItem,
    buildSuccessQueryResultItem,
} from '@/features/workspace/services/query-result-item'
import {
    buildQueryResultDiff,
    canCompareQueryResults,
} from '@/features/workspace/services/query-result-diff.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

export async function executeCrossEnvSampleCompare(options: {
    left: SchemaScope
    right: SchemaScope
    leftEnv: NormalizedConnectionEnvironment
    rightEnv: NormalizedConnectionEnvironment
    sql: string
    sampleRows: number
    translate?: (key: string) => string
    execute?: (sql: string, connection: {
        connectionId: string
        database: string
        maxRows?: number
    }) => Promise<import('@/shared/api/types').ExecuteSqlResult>
}): Promise<CrossEnvCompareExecution> {
    const sqlError = validateCrossEnvCompareSql(options.sql)
    if (sqlError) {
        throw new Error(sqlError)
    }
    if (!scopesReadyForCompare(options.left, options.right)) {
        throw new Error('sameScope')
    }

    const sql = options.sql.trim()
    const sampleRows = clampCrossEnvSampleRowCount(options.sampleRows)
    const execute = options.execute ?? (await import('@/api')).sqlApi.execute

    const leftLabel = buildCrossEnvResultLabel(options.left, options.leftEnv, options.translate)
    const rightLabel = buildCrossEnvResultLabel(options.right, options.rightEnv, options.translate)

    let leftResult
    try {
        const payload = await execute(sql, {
            connectionId: options.left.connectionId,
            database: options.left.database,
            maxRows: sampleRows,
        })
        leftResult = buildSuccessQueryResultItem(payload, 0, sql, options.left.dbType)
        leftResult.label = leftLabel
    } catch (error) {
        const translate = options.translate ?? t
        const message = resolveCaughtApiErrorMessage(error, translate, 'crossEnvCompare.compareFailed')
        leftResult = buildErrorQueryResultItem({sql, errorMessage: message}, 0)
        leftResult.label = leftLabel
        throw new CrossEnvCompareSideError('left', leftResult, message)
    }

    let rightResult
    try {
        const payload = await execute(sql, {
            connectionId: options.right.connectionId,
            database: options.right.database,
            maxRows: sampleRows,
        })
        rightResult = buildSuccessQueryResultItem(payload, 1, sql, options.right.dbType)
        rightResult.label = rightLabel
    } catch (error) {
        const translate = options.translate ?? t
        const message = resolveCaughtApiErrorMessage(error, translate, 'crossEnvCompare.compareFailed')
        rightResult = buildErrorQueryResultItem({sql, errorMessage: message}, 1)
        rightResult.label = rightLabel
        throw new CrossEnvCompareSideError('right', rightResult, message)
    }

    if (!canCompareQueryResults(leftResult, rightResult)) {
        throw new Error('notComparable')
    }

    return {
        diff: buildQueryResultDiff(leftResult, rightResult),
        leftResult,
        rightResult,
    }
}
