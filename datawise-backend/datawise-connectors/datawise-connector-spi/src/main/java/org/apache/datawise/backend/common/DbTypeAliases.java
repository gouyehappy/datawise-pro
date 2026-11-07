package org.apache.datawise.backend.common;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 非 canonical id 到 {@link DbType} 的别名表；后续外置配置时可替换为文件加载。
 */
final class DbTypeAliases {

    private static final Map<String, DbType> BY_ALIAS = Map.of(
            "mssql", DbType.SQLSERVER,
            "postgres", DbType.POSTGRESQL,
            "sqlite", DbType.SQLITE3,
            "hsqldb", DbType.HSQL,
            "dameng", DbType.DM,
            "spark", DbType.HIVE,
            "impala", DbType.HIVE);

    private DbTypeAliases() {
    }

    static Optional<DbType> resolve(String normalized) {
        if (normalized == null || normalized.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(BY_ALIAS.get(normalized.toLowerCase(Locale.ROOT)));
    }

    /** Alias ids that map to a {@link DbType} constant (e.g. {@code mssql} → SQLSERVER). */
    static Set<String> aliasIds() {
        return BY_ALIAS.keySet();
    }
}
