package org.apache.datawise.backend.jdbc.support;

import com.zaxxer.hikari.HikariConfig;
import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Pins which drivers receive {@code useCursorFetch}. The flag is only understood by
 * MySQL Connector/J, so it must not leak onto the OLAP or MariaDB drivers.
 */
class HikariJdbcPoolTuningCursorFetchTest {

    @Test
    void mysqlGetsServerSideCursorsByDefault() {
        HikariConfig config = new HikariConfig();

        HikariJdbcPoolTuning.apply(config, entity("mysql"), new JdbcPoolProperties());

        assertEquals("true", config.getDataSourceProperties().getProperty("useCursorFetch"));
    }

    @Test
    void olapFamilyDoesNotGetTheFlag() {
        HikariConfig config = new HikariConfig();

        HikariJdbcPoolTuning.apply(config, entity("doris"), new JdbcPoolProperties());

        assertNull(config.getDataSourceProperties().getProperty("useCursorFetch"));
    }

    @Test
    void mariadbDriverDoesNotGetTheFlag() {
        HikariConfig config = new HikariConfig();

        HikariJdbcPoolTuning.apply(config, entity("mariadb"), new JdbcPoolProperties());

        assertNull(config.getDataSourceProperties().getProperty("useCursorFetch"));
    }

    @Test
    void propertySwitchesTheFlagOff() {
        JdbcPoolProperties properties = new JdbcPoolProperties();
        properties.setCursorFetch(false);
        HikariConfig config = new HikariConfig();

        HikariJdbcPoolTuning.apply(config, entity("mysql"), properties);

        assertNull(config.getDataSourceProperties().getProperty("useCursorFetch"));
    }

    @Test
    void missingPropertiesKeepTheDefaultOn() {
        HikariConfig config = new HikariConfig();

        HikariJdbcPoolTuning.apply(config, entity("mysql"));

        assertEquals("true", config.getDataSourceProperties().getProperty("useCursorFetch"));
    }

    private static ConnectionEntity entity(String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType(dbType);
        return entity;
    }
}
