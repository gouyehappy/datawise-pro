package org.apache.datawise.backend.database.connection;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JdbcDriverDeliveryModeTest {

    @Test
    void coreFamiliesFollowRelatedDbTypes() {
        assertEquals("core", JdbcDriverService.deliveryMode("postgresql", List.of("postgresql"), false));
        assertEquals("core", JdbcDriverService.deliveryMode("mysql", List.of("mysql", "mariadb"), false));
        assertEquals("core", JdbcDriverService.deliveryMode("sqlite", List.of("sqlite3"), false));
    }

    @Test
    void sidecarCoversBundlesAndHeavyIds() {
        assertEquals("sidecar", JdbcDriverService.deliveryMode("hive", List.of("hive"), true));
        assertEquals("sidecar", JdbcDriverService.deliveryMode("oracle", List.of("oracle"), false));
        assertEquals("sidecar", JdbcDriverService.deliveryMode("sqlserver", List.of(), false));
    }

    @Test
    void remainingFamiliesAreOnDemand() {
        assertEquals("on-demand", JdbcDriverService.deliveryMode("h2", List.of("h2"), false));
        assertEquals("on-demand", JdbcDriverService.deliveryMode(null, null, false));
    }
}
