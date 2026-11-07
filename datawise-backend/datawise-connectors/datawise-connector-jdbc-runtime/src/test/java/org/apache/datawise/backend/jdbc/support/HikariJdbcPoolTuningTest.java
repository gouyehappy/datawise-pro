package org.apache.datawise.backend.jdbc.support;

import com.zaxxer.hikari.HikariConfig;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HikariJdbcPoolTuningTest {

    @Test
    void appliesMysqlProtocolTestQueryForDoris() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("doris");
        HikariConfig config = new HikariConfig();
        HikariJdbcPoolTuning.apply(config, entity);
        assertEquals("SELECT 1", config.getConnectionTestQuery());
        assertEquals(300_000, config.getMaxLifetime());
        assertEquals(60_000, config.getKeepaliveTime());
        assertEquals(120_000, config.getIdleTimeout());
    }

    @Test
    void appliesMysqlProtocolTestQueryForMysqlWithoutOlapTuning() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        HikariConfig config = new HikariConfig();
        HikariJdbcPoolTuning.apply(config, entity);
        assertEquals("SELECT 1", config.getConnectionTestQuery());
    }

    @Test
    void appliesPostgresqlTestQuery() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("postgresql");
        HikariConfig config = new HikariConfig();
        HikariJdbcPoolTuning.apply(config, entity);
        assertEquals("SELECT 1", config.getConnectionTestQuery());
    }

    @Test
    void appliesElasticsearchReadOnlyPoolDefaults() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("elasticsearch");
        HikariConfig config = new HikariConfig();
        HikariJdbcPoolTuning.apply(config, entity);
        assertEquals(true, config.isReadOnly());
        assertEquals(true, config.isAutoCommit());
        assertEquals("SELECT 1", config.getConnectionTestQuery());
    }
}
