package org.apache.datawise.backend.sql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.jdbc.execution.SqlPaginationClauseSupport;
import org.apache.datawise.backend.jdbc.execution.pagination.LimitOffsetSqlPaginationDialect;
import org.apache.datawise.backend.jdbc.execution.pagination.OracleSqlPaginationDialect;
import org.apache.datawise.backend.sql.pagination.SqlServerSqlPaginationDialect;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SqlPaginationDialectRegistryTest {

    @Test
    void applyLimitOffset_usesCatalogSchemaDialectFromPlugins() {
        ConnectorPluginContributionHolder holder = new ConnectorPluginContributionHolder();
        holder.setContributions(new ConnectorDialectContributions(
                List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(), List.of(),
                List.of(new CatalogSchemaPaginationDialect()),
                List.of()));
        SqlPaginationDialectRegistry registry = new SqlPaginationDialectRegistry(
                List.of(new LimitOffsetSqlPaginationDialect(), new SqlServerSqlPaginationDialect()),
                holder);
        String sql = "SELECT * FROM \"hive\".\"a003\".\"t\"";
        assertEquals(
                "SELECT * FROM \"hive\".\"a003\".\"t\" LIMIT 501",
                registry.applyLimitOffset(sql, "trino", 501, 0));
    }

    @Test
    void applyLimitOffset_usesSqlServerSyntax() {
        SqlPaginationDialectRegistry registry = new SqlPaginationDialectRegistry(
                List.of(new LimitOffsetSqlPaginationDialect(), new SqlServerSqlPaginationDialect()),
                new ConnectorPluginContributionHolder());
        assertEquals(
                "SELECT * FROM users ORDER BY 1 OFFSET 0 ROWS FETCH NEXT 501 ROWS ONLY",
                registry.applyLimitOffset("SELECT * FROM users", "sqlserver", 501, 0));
    }

    @Test
    void applyLimitOffset_usesOracleSyntaxWithOrderBy() {
        ConnectorPluginContributionHolder holder = new ConnectorPluginContributionHolder();
        holder.setContributions(new ConnectorDialectContributions(
                List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(), List.of(),
                List.of(new FakeOraclePaginationDialect()),
                List.of()));
        SqlPaginationDialectRegistry registry = new SqlPaginationDialectRegistry(
                List.of(new LimitOffsetSqlPaginationDialect()),
                holder);
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT * FROM \"DBSDBA\".\"T\" ORDER BY ROWID) WHERE ROWNUM <= 101)",
                registry.applyLimitOffset("SELECT * FROM \"DBSDBA\".\"T\"", "oracle", 101, 0));
    }

    @Test
    void applyLimitOffset_fallsBackToOracleWithoutPlugin() {
        SqlPaginationDialectRegistry registry = new SqlPaginationDialectRegistry(
                List.of(new LimitOffsetSqlPaginationDialect(), new OracleSqlPaginationDialect()),
                new ConnectorPluginContributionHolder());
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT * FROM \"DBSDBA\".\"HIVE_1114\" ORDER BY ROWID) WHERE ROWNUM <= 101)",
                registry.applyLimitOffset("SELECT * FROM \"DBSDBA\".\"HIVE_1114\"", "oracle", 101, 0));
    }

    @Test
    void applyLimitOffset_builtinFallbackUsesOracleWhenClasspathEmpty() {
        SqlPaginationDialectRegistry registry = new SqlPaginationDialectRegistry(
                List.of(),
                new ConnectorPluginContributionHolder());
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT * FROM t ORDER BY ROWID) WHERE ROWNUM <= 50)",
                registry.applyLimitOffset("SELECT * FROM t", "oracle", 50, 0));
    }

    @Test
    void applyLimitOffset_builtinFallbackUsesSchemaRootForDameng() {
        SqlPaginationDialectRegistry registry = new SqlPaginationDialectRegistry(
                List.of(),
                new ConnectorPluginContributionHolder());
        assertEquals(
                "SELECT * FROM t ORDER BY 1 OFFSET 10 ROWS FETCH NEXT 50 ROWS ONLY",
                registry.applyLimitOffset("SELECT * FROM t", "dameng", 50, 10));
    }

    /** 模拟 Oracle 插件贡献（更高 priority，覆盖 classpath 内置方言）。 */
    private static final class FakeOraclePaginationDialect extends OracleSqlPaginationDialect {

        @Override
        public int priority() {
            return 21;
        }
    }

    /** 模拟 Trino/Presto 插件贡献，避免 connector-api 测试依赖 connector-trino。 */
    private static final class CatalogSchemaPaginationDialect implements SqlPaginationDialect {

        @Override
        public boolean supports(String dbType) {
            return DbType.isCatalogSchemaFamily(dbType);
        }

        @Override
        public int priority() {
            return 24;
        }

        @Override
        public String applyLimitOffset(String sql, int limit, int offset) {
            SqlPaginationClauseSupport.validateLimitOffset(limit, offset);
            String clause = offset <= 0
                    ? " LIMIT " + limit
                    : " OFFSET " + offset + " LIMIT " + limit;
            return SqlPaginationClauseSupport.appendClause(sql, clause);
        }
    }
}
