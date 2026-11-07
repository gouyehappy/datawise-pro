package org.apache.datawise.sqlflow.dialect;

import org.apache.datawise.backend.common.DbType;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

public final class DefaultSqlFlowDialectRegistry implements SqlFlowDialectRegistry {

    private static final Map<String, SqlFlowDialect> BUILTIN = buildBuiltinMap();

    private final List<SqlFlowDialectContributor> contributors;
    private final SqlFlowAnalyzeOptionsProfile optionsProfile;

    public DefaultSqlFlowDialectRegistry(List<SqlFlowDialectContributor> contributors) {
        this(contributors, DefaultSqlFlowAnalyzeOptionsProfile.INSTANCE);
    }

    public DefaultSqlFlowDialectRegistry(
            List<SqlFlowDialectContributor> contributors,
            SqlFlowAnalyzeOptionsProfile optionsProfile
    ) {
        this.contributors = contributors == null ? List.of() : List.copyOf(contributors).stream()
                .sorted(Comparator.comparingInt(SqlFlowDialectContributor::order))
                .toList();
        this.optionsProfile = optionsProfile == null
                ? DefaultSqlFlowAnalyzeOptionsProfile.INSTANCE
                : optionsProfile;
    }

    public static DefaultSqlFlowDialectRegistry withDefaults() {
        return new DefaultSqlFlowDialectRegistry(List.of());
    }

    @Override
    public SqlFlowDialect resolve(String dbTypeId) {
        String normalized = normalize(dbTypeId);
        for (SqlFlowDialectContributor contributor : contributors) {
            Optional<SqlFlowDialect> resolved = contributor.resolve(normalized);
            if (resolved.isPresent()) {
                return resolved.get();
            }
        }
        return BUILTIN.getOrDefault(normalized, SqlFlowDialect.GENERIC);
    }

    @Override
    public SqlFlowAnalyzeOptionsProfile optionsFor(String dbTypeId) {
        return (base, dialect) -> optionsProfile.apply(base, dialect == null ? resolve(dbTypeId) : dialect);
    }

    private static String normalize(String dbTypeId) {
        if (dbTypeId == null || dbTypeId.isBlank()) {
            return DbType.GENERIC.id();
        }
        return DbType.find(dbTypeId)
                .orElse(DbType.OTHER)
                .id();
    }

    private static Map<String, SqlFlowDialect> buildBuiltinMap() {
        Map<String, SqlFlowDialect> map = new LinkedHashMap<>();
        map.put(DbType.MYSQL.id(), SqlFlowDialect.MYSQL);
        map.put(DbType.MARIADB.id(), SqlFlowDialect.MYSQL);
        map.put(DbType.TIDB.id(), SqlFlowDialect.MYSQL);
        map.put(DbType.OCEANBASE.id(), SqlFlowDialect.MYSQL);
        map.put(DbType.STARROCKS.id(), SqlFlowDialect.MYSQL);
        map.put(DbType.DORIS.id(), SqlFlowDialect.MYSQL);
        map.put(DbType.GBASE8A.id(), SqlFlowDialect.MYSQL);

        map.put(DbType.POSTGRESQL.id(), SqlFlowDialect.POSTGRESQL);
        map.put(DbType.KINGBASE.id(), SqlFlowDialect.POSTGRESQL);
        map.put(DbType.OPENGAUSS.id(), SqlFlowDialect.POSTGRESQL);
        map.put(DbType.HIGHGO.id(), SqlFlowDialect.POSTGRESQL);
        map.put(DbType.GAUSSDB.id(), SqlFlowDialect.POSTGRESQL);
        map.put(DbType.GREENPLUM.id(), SqlFlowDialect.GREENPLUM);

        map.put(DbType.ORACLE.id(), SqlFlowDialect.ORACLE);
        map.put(DbType.DM.id(), SqlFlowDialect.ORACLE);
        map.put(DbType.OSCAR.id(), SqlFlowDialect.ORACLE);

        map.put(DbType.SQLSERVER.id(), SqlFlowDialect.MSSQL);
        map.put(DbType.SYBASE.id(), SqlFlowDialect.SYBASE);
        map.put(DbType.DB2.id(), SqlFlowDialect.DB2);

        map.put(DbType.HIVE.id(), SqlFlowDialect.HIVE);
        map.put(DbType.FLINK.id(), SqlFlowDialect.HIVE);
        map.put(DbType.KYLIN.id(), SqlFlowDialect.HIVE);
        map.put(DbType.TRINO.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.PRESTO.id(), SqlFlowDialect.GENERIC);

        map.put(DbType.CLICKHOUSE.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.SQLITE3.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.H2.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.HSQL.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.CACHEDB.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.PHOENIX.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.TDENGINE.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.GENERIC.id(), SqlFlowDialect.GENERIC);
        map.put(DbType.OTHER.id(), SqlFlowDialect.GENERIC);

        for (DbType dbType : DbType.values()) {
            map.putIfAbsent(dbType.id().toLowerCase(Locale.ROOT), SqlFlowDialect.GENERIC);
        }
        return Map.copyOf(map);
    }
}
