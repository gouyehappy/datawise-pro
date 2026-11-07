/** 去除不可见空白（NBSP、零宽字符、BOM 等），避免“假空行”被当成语句起始行 */
export function normalizeSqlLineContent(line: string): string {
    return line
        .replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/** 单行可执行 SQL：规范化后空行或纯 `--` 注释行视为无可执行内容 */
export function extractExecutableLineSql(line: string): string {
    const normalized = normalizeSqlLineContent(line)
    if (!normalized) return ''
    if (/^--/.test(normalized)) return ''
    return normalized
}
