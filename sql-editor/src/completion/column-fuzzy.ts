/**
 * 列名安全模糊：仅「全名前缀」+「snake/camel 首字母缩写」。
 * 禁止子串模糊，避免 COUNT → user_count。
 */

/** create_time → ct；createTime → ct；user_count → uc */
export function columnNameInitials(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return ''
    const bySnake = trimmed.split(/[_\s]+/).filter(Boolean)
    if (bySnake.length >= 2) {
        return bySnake.map((part) => part[0]?.toLowerCase() ?? '').join('')
    }
    const byCamel = trimmed.split(/(?=[A-Z])/).filter(Boolean)
    if (byCamel.length >= 2) {
        return byCamel.map((part) => part[0]?.toLowerCase() ?? '').join('')
    }
    return trimmed[0]?.toLowerCase() ?? ''
}

/** 前缀是否命中列名缩写（ct → create_time） */
export function matchesColumnInitials(name: string, prefix: string): boolean {
    if (!prefix) return true
    const p = prefix.toLowerCase()
    if (p.length < 2) return false
    const initials = columnNameInitials(name)
    if (!initials || initials.length < 2) return false
    return initials.startsWith(p)
}
