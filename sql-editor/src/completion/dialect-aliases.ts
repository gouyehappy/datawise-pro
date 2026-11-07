/** 数据源类型 → 关键字配置文件名（不含 .txt） */
export const SQL_DIALECT_ALIASES: Record<string, string> = {
    mariadb: 'mysql',
    oceanbase: 'mysql',
    tidb: 'mysql',
    starrocks: 'mysql',
    doris: 'mysql',
    kingbase: 'postgresql',
    dm: 'oracle',
    presto: 'hive',
    db2: 'sqlserver',
    flink: 'flink',
}

/** 解析为 keywords-config 下的文件名 */
export function resolveSqlDialectFile(dialect?: string | null): string | undefined {
    if (!dialect) return undefined
    const normalized = dialect.toLowerCase().trim()
    if (!normalized) return undefined
    return SQL_DIALECT_ALIASES[normalized] ?? normalized
}
