/**
 * T-SCHEMA-1：Schema 部署原子性诚实分类（对齐 DBX GuaranteedRollback / PartialEffectsPossible）。
 */
import type {DbType} from '@/core/types'
import {supportsConnectionFeature} from '@/shared/capabilities/supports-connection-feature'

export type DeployAtomicity = 'guaranteed_rollback' | 'partial_effects_possible'

export type DeployOutcome = 'committed' | 'rolled_back' | 'mixed' | 'failed'

const TXN_CONTROL = /\b(COMMIT|ROLLBACK|SAVEPOINT|BEGIN|START\s+TRANSACTION)\b/i
const DDL_HINT =
    /\b(CREATE|ALTER|DROP|TRUNCATE|RENAME|COMMENT\s+ON|GRANT|REVOKE)\b/i

export function scriptContainsTxnControl(sql: string): boolean {
    return TXN_CONTROL.test(sql)
}

export function scriptContainsDdl(sql: string): boolean {
    return DDL_HINT.test(sql)
}

/**
 * @param canRunInSingleTransaction 执行器是否支持单事务包多语句；未知时传 false 更诚实
 */
export function classifyDeployAtomicity(options: {
    sql: string
    dbType?: DbType | string | null
    canRunInSingleTransaction?: boolean
}): DeployAtomicity {
    const {sql, dbType, canRunInSingleTransaction = true} = options
    if (!canRunInSingleTransaction) return 'partial_effects_possible'
    if (scriptContainsTxnControl(sql)) return 'partial_effects_possible'
    if (!scriptContainsDdl(sql)) return 'guaranteed_rollback'
    if (supportsConnectionFeature({dbType: dbType ?? undefined}, 'transactionalDdl')) {
        return 'guaranteed_rollback'
    }
    return 'partial_effects_possible'
}

/** 迁移「自动建表」等结构路径：无脚本时按方言 transactionalDdl 诚实分类。 */
export function classifyStructureDeployAtomicity(options: {
    dbType?: DbType | string | null
    includesDdl: boolean
}): DeployAtomicity | null {
    if (!options.includesDdl) return null
    return classifyDeployAtomicity({
        sql: 'CREATE TABLE __datawise_structure_probe__ (id INT)',
        dbType: options.dbType,
    })
}

export function resolveDeployOutcome(options: {
    atomicity: DeployAtomicity
    ok: boolean
    executedCount: number
    totalStatements: number
}): DeployOutcome {
    const {atomicity, ok, executedCount, totalStatements} = options
    if (ok) return 'committed'
    if (executedCount <= 0) return 'failed'
    if (atomicity === 'guaranteed_rollback') return 'rolled_back'
    if (executedCount < totalStatements) return 'mixed'
    return 'failed'
}
