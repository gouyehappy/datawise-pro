import type {ExecuteSqlResult} from '@/shared/api/types'

/**
 * T-MULTI-1：将可选的 resultSets 展开为控制台 Tab 列表。
 * 单结果 / 旧后端：返回 [result] 自身。
 */
export function expandExecuteSqlResults(result: ExecuteSqlResult): ExecuteSqlResult[] {
    const sets = result.resultSets
    if (Array.isArray(sets) && sets.length > 1) {
        return sets.map((leaf) => ({
            ...leaf,
            // Avoid nested expansion if a buggy client round-trips the envelope.
            resultSets: undefined,
            sql: leaf.sql || result.sql,
            durationMs: leaf.durationMs || result.durationMs,
        }))
    }
    return [result]
}
