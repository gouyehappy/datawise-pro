/** 在控制台文档中追加 AI 修复结果的定位与写入逻辑 */

export interface AppendConsoleSqlFixResult {
    /** 写入后的完整文档 */
    text: string
    /** AI 修复 SQL 起始行（1-based），用于定位编辑器光标 */
    focusLine: number
}

export interface AppendConsoleSqlFixOptions {
    /** 追加块上方的注释说明，默认 `AI fix suggestion` */
    commentLabel?: string
}

/**
 * 把 AI 修复后的 SQL **追加到出错语句之后**，保留编辑器原有全部内容。
 *
 * 与旧的替换行为不同：无论能否匹配到出错语句，都绝不会覆盖原文档。
 * - 精确匹配原文 → 在该语句结束处插入；
 * - 仅空白差异 → 用忽略空白的紧凑匹配定位；
 * - 完全匹配不到 → 追加到文档末尾。
 *
 * 插入格式：
 * ```sql
 * <原语句>
 *
 * -- AI 修复建议
 * <修复 SQL>
 * ```
 */
export function appendConsoleSqlFixAfterStatement(
    document: string,
    failedSql: string,
    fixedSql: string,
    options: AppendConsoleSqlFixOptions = {},
): AppendConsoleSqlFixResult {
    const source = document ?? ''
    const fixed = fixedSql.trim()
    if (!fixed) return {text: source, focusLine: 1}

    const failed = failedSql.trim()
    let insertAt = source.length

    if (failed) {
        const exactAt = source.indexOf(failed)
        if (exactAt >= 0) {
            insertAt = exactAt + failed.length
        } else {
            // 容错：编辑器里的换行/缩进可能与执行时 captured SQL 不同，
            // 用「忽略所有空白」的紧凑串匹配，并映射回原文下标。
            const indexMap: number[] = []
            let compacted = ''
            for (let i = 0; i < source.length; i += 1) {
                if (!/\s/.test(source[i])) {
                    compacted += source[i]
                    indexMap.push(i)
                }
            }
            const compactedFailed = failed.replace(/\s+/g, '')
            const compactAt = compactedFailed ? compacted.indexOf(compactedFailed) : -1
            if (compactAt >= 0) {
                const lastIndex = compactAt + compactedFailed.length - 1
                insertAt = (indexMap[lastIndex] ?? source.length - 1) + 1
            }
        }
    }

    const before = source.slice(0, insertAt)
    const after = source.slice(insertAt)

    const rawComment = (options.commentLabel ?? 'AI fix suggestion').trim()
    const comment = rawComment.startsWith('--') ? rawComment : `-- ${rawComment}`

    let block: string
    if (before.length === 0) {
        block = `${comment}\n`
    } else {
        // 先闭合当前行，再空一行作为视觉分隔
        block = `${/\n$/.test(before) ? '' : '\n'}\n${comment}\n`
    }
    const fixedOffsetInBlock = block.length
    block += fixed
    if (after.length > 0 && !/^\r?\n/.test(after)) {
        block += '\n'
    }

    const text = `${before}${block}${after}`
    const focusLine = `${before}${block.slice(0, fixedOffsetInBlock)}`.split('\n').length
    return {text, focusLine}
}
