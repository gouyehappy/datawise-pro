package org.apache.datawise.backend.jdbc.support;

import com.zaxxer.hikari.HikariConfig;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;
import java.util.Set;

/**
 * HikariCP 池参数：按数据库族设置连接校验与生命周期，降低池内陈旧连接（尤其 Doris FE 空闲断连）。
 */
public final class HikariJdbcPoolTuning {

    private static final String MYSQL_PROTOCOL_TEST_QUERY = "SELECT 1";
    private static final String POSTGRESQL_TEST_QUERY = "SELECT 1";

    /**
     * Databases served by MySQL Connector/J, the only driver here that implements
     * {@code useCursorFetch}. MariaDB/OceanBase/GBase drivers either ignore or reject the flag,
     * and the OLAP family does not support server-side cursors at all.
     */
    private static final Set<String> CURSOR_FETCH_IDS = Set.of("mysql", "tidb");

    private HikariJdbcPoolTuning() {
    }

    public static void apply(HikariConfig config, ConnectionEntity entity) {
        apply(config, entity, null);
    }

    public static void apply(HikariConfig config, ConnectionEntity entity, JdbcPoolProperties poolProperties) {
        String dbType = DbTypeFamilies.normalize(entity.getDbType());
        if (DbTypeFamilies.isMysqlProtocol(dbType)) {
            config.setConnectionTestQuery(MYSQL_PROTOCOL_TEST_QUERY);
            config.addDataSourceProperty("cachePrepStmts", "true");
            config.addDataSourceProperty("prepStmtCacheSize", "250");
            config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
            config.addDataSourceProperty("useServerPrepStmts", "true");
            // Server-side cursors are what make Statement.setFetchSize stream instead of buffer
            // the whole result set in the driver.
            boolean cursorFetch = poolProperties == null || poolProperties.isCursorFetch();
            if (cursorFetch && CURSOR_FETCH_IDS.contains(dbType.toLowerCase(Locale.ROOT))) {
                config.addDataSourceProperty("useCursorFetch", "true");
            }
            if (DbTypeFamilies.isOlapFamily(dbType)) {
                config.setMaxLifetime(300_000);
                config.setKeepaliveTime(60_000);
                config.setIdleTimeout(120_000);
            }
            return;
        }
        if (DbTypeFamilies.isPostgresqlFamily(dbType)) {
            config.setConnectionTestQuery(POSTGRESQL_TEST_QUERY);
            return;
        }
        // Elasticsearch SQL JDBC is always read-only / auto-commit. Hikari defaults to
        // readOnly=false and then calls Connection.setReadOnly(false), which the driver rejects.
        if (DbType.ELASTICSEARCH.matches(dbType)) {
            config.setReadOnly(true);
            config.setAutoCommit(true);
            config.setConnectionTestQuery("SELECT 1");
        }
    }
}
