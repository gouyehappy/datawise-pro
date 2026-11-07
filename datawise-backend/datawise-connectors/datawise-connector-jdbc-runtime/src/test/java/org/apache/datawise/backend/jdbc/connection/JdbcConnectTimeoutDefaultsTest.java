package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class JdbcConnectTimeoutDefaultsTest {

    @Test
    void appliesMysqlTimeoutsInMilliseconds() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        Properties props = new Properties();

        JdbcConnectTimeoutDefaults.apply(entity, props, 10_000, 60_000);

        assertEquals("10000", props.getProperty("connectTimeout"));
        assertEquals("60000", props.getProperty("socketTimeout"));
    }

    @Test
    void doesNotOverrideAdvancedConfig() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        Properties props = new Properties();
        props.setProperty("connectTimeout", "3000");

        JdbcConnectTimeoutDefaults.apply(entity, props, 10_000, 60_000);

        assertEquals("3000", props.getProperty("connectTimeout"));
        assertEquals("60000", props.getProperty("socketTimeout"));
    }

    @Test
    void appliesPostgresqlTimeoutsInSeconds() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("postgresql");
        Properties props = new Properties();

        JdbcConnectTimeoutDefaults.apply(entity, props, 10_000, 60_000);

        assertEquals("10", props.getProperty("connectTimeout"));
        assertEquals("60", props.getProperty("socketTimeout"));
        assertEquals("10", props.getProperty("loginTimeout"));
    }

    @Test
    void skipsSocketTimeoutWhenDisabled() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        Properties props = new Properties();

        JdbcConnectTimeoutDefaults.apply(entity, props, 8_000, 0);

        assertEquals("8000", props.getProperty("connectTimeout"));
        assertFalse(props.containsKey("socketTimeout"));
    }

    @Test
    void appliesElasticsearchTimeoutsWithoutLoginTimeout() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("elasticsearch");
        Properties props = new Properties();

        JdbcConnectTimeoutDefaults.apply(entity, props, 10_000, 60_000);

        assertEquals("10000", props.getProperty("connect.timeout"));
        assertEquals("60000", props.getProperty("network.timeout"));
        assertFalse(props.containsKey("loginTimeout"));
    }

    @Test
    void skipsLoginTimeoutForTrinoFamily() {
        for (String dbType : new String[]{"trino", "presto"}) {
            ConnectionEntity entity = new ConnectionEntity();
            entity.setDbType(dbType);
            Properties props = new Properties();

            JdbcConnectTimeoutDefaults.apply(entity, props, 10_000, 60_000);

            assertFalse(props.containsKey("loginTimeout"), dbType);
            assertFalse(props.containsKey("connectTimeout"), dbType);
        }
    }

    @Test
    void appliesLoginTimeoutForAllowlistedDrivers() {
        for (String dbType : new String[]{"oracle", "clickhouse", "hive", "flink"}) {
            ConnectionEntity entity = new ConnectionEntity();
            entity.setDbType(dbType);
            Properties props = new Properties();

            JdbcConnectTimeoutDefaults.apply(entity, props, 10_000, 60_000);

            assertEquals("10", props.getProperty("loginTimeout"), dbType);
        }
    }

    @Test
    void skipsLoginTimeoutForCustomJdbcTypes() {
        for (String dbType : new String[]{"generic", "other"}) {
            ConnectionEntity entity = new ConnectionEntity();
            entity.setDbType(dbType);
            Properties props = new Properties();

            JdbcConnectTimeoutDefaults.apply(entity, props, 10_000, 60_000);

            assertFalse(props.containsKey("loginTimeout"), dbType);
        }
    }
}
