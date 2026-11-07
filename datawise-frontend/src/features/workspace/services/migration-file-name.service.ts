import {isValidSqlFileBaseName} from '@/features/workspace/services/console-tab-title'

/** Tab 展示名 → 迁移文件描述段（snake_case） */
export function sanitizeMigrationSlug(label: string): string {
    const trimmed = label.trim().replace(/\.sql$/i, '')
    if (!trimmed) return ''
    const slug = trimmed
        .replace(/[^\w\u4e00-\u9fff]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 64)
    return slug || ''
}

/** 预填 Flyway 风格文件名：V{timestamp}_{slug}.sql */
export function buildDefaultMigrationFileName(slug?: string): string {
    const safeSlug = sanitizeMigrationSlug(slug ?? '') || 'migration'
    return `V${Date.now()}_${safeSlug}.sql`
}

export function isValidMigrationFileName(fileName: string): boolean {
    const trimmed = fileName.trim()
    if (!trimmed.toLowerCase().endsWith('.sql')) return false
    const base = trimmed.replace(/\.sql$/i, '')
    if (!/^V[\w.-]+_[\w\u4e00-\u9fff.-]+$/i.test(base)) return false
    return isValidSqlFileBaseName(base)
}

/** 规范化用户输入；无效时返回 null */
export function normalizeMigrationFileName(input: string): string | null {
    const trimmed = input.trim()
    if (!trimmed) return null
    const withExt = trimmed.toLowerCase().endsWith('.sql') ? trimmed : `${trimmed}.sql`
    if (!isValidMigrationFileName(withExt)) return null
    return withExt
}
