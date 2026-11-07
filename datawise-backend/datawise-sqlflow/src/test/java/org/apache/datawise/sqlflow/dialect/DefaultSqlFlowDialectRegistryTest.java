package org.apache.datawise.sqlflow.dialect;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeOptions;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DefaultSqlFlowDialectRegistryTest {

    private final DefaultSqlFlowDialectRegistry registry = DefaultSqlFlowDialectRegistry.withDefaults();

    @Test
    void mapsCommonDbTypes() {
        assertEquals(SqlFlowDialect.MYSQL, registry.resolve(DbType.MYSQL.id()));
        assertEquals(SqlFlowDialect.POSTGRESQL, registry.resolve(DbType.POSTGRESQL.id()));
        assertEquals(SqlFlowDialect.MSSQL, registry.resolve(DbType.SQLSERVER.id()));
        assertEquals(SqlFlowDialect.HIVE, registry.resolve(DbType.HIVE.id()));
        assertEquals(SqlFlowDialect.GENERIC, registry.resolve(DbType.TRINO.id()));
        assertEquals(SqlFlowDialect.HIVE, registry.resolve(DbType.FLINK.id()));
    }

    @Test
    void resolvesDbTypeAliasesAndDisplayNames() {
        assertEquals(SqlFlowDialect.POSTGRESQL, registry.resolve("PostgreSQL"));
        assertEquals(SqlFlowDialect.POSTGRESQL, registry.resolve("postgres"));
        assertEquals(SqlFlowDialect.MYSQL, registry.resolve("TiDB"));
    }

    @Test
    void contributorOverridesBuiltin() {
        DefaultSqlFlowDialectRegistry custom = new DefaultSqlFlowDialectRegistry(List.of(new SqlFlowDialectContributor() {
            @Override
            public int order() {
                return 0;
            }

            @Override
            public Optional<SqlFlowDialect> resolve(String dbTypeId) {
                return "clickhouse".equals(dbTypeId)
                        ? Optional.of(SqlFlowDialect.BIGQUERY)
                        : Optional.empty();
            }
        }));

        assertEquals(SqlFlowDialect.BIGQUERY, custom.resolve(DbType.CLICKHOUSE.id()));
    }

    @Test
    void appliesDialectSpecificOptions() {
        SqlFlowAnalyzeOptions hiveOptions = registry.optionsFor(DbType.HIVE.id())
                .apply(SqlFlowAnalyzeOptions.defaults(), SqlFlowDialect.HIVE);

        assertTrue(hiveOptions.isShowTemporaryTables());
    }
}
