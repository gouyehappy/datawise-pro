/**
 * B2-2: offline / unpaid lite hints for console AI — not a full model reply,
 * just enough to unblock reading an error before Insight upsell.
 */

export function buildDegradedSqlErrorHint(errorMessage: string | null | undefined): string | null {
    const text = errorMessage?.replace(/\s+/g, ' ').trim()
    if (!text) return null
    const lower = text.toLowerCase()

    if (/syntax\s+error|you have an error in your sql|parser error|unexpected token/i.test(text)
        || lower.includes('语法错误')) {
        return 'sqlSyntax'
    }
    if (/unknown column|column .+ does not exist|invalid column/i.test(text)
        || lower.includes('未知列')
        || lower.includes('列不存在')) {
        return 'unknownColumn'
    }
    if (/table .+ (doesn't|does not) exist|relation .+ does not exist|unknown table/i.test(text)
        || /表.?不存在|不存在的表|找不到表/.test(text)) {
        return 'unknownTable'
    }
    if (/access denied|permission denied|insufficient privilege/i.test(text)
        || /权限不足|没有权限|拒绝访问|拒绝/.test(text)) {
        return 'permission'
    }
    if (/duplicate|unique constraint|already exists/i.test(text)
        || lower.includes('重复')
        || lower.includes('唯一')) {
        return 'duplicate'
    }
    if (/timeout|timed out|canceling statement/i.test(text)
        || lower.includes('超时')) {
        return 'timeout'
    }
    return 'generic'
}

export type DegradedSqlErrorHintId = NonNullable<ReturnType<typeof buildDegradedSqlErrorHint>>
