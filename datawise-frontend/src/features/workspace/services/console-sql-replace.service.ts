/** 在控制台文档中替换失败语句为 AI 修复结果 */
export function replaceConsoleSqlStatement(
    document: string,
    failedSql: string,
    fixedSql: string,
): { text: string; focusLine: number } {
    const failed = failedSql.trim()
    const fixed = fixedSql.trim()
    if (!fixed) {
        return {text: document, focusLine: 1}
    }
    if (!failed) {
        return {text: fixed, focusLine: 1}
    }

    const idx = document.indexOf(failed)
    if (idx >= 0) {
        const before = document.slice(0, idx)
        const after = document.slice(idx + failed.length)
        const focusLine = before.split('\n').length
        return {text: `${before}${fixed}${after}`, focusLine}
    }

    return {text: fixed, focusLine: 1}
}
