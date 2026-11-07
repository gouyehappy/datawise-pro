package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.jdbc.connection.JdbcMavenCoordinate;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HiveJdbcDriverBundleTest {

    @Test
    void bundleIncludesServiceRpc() {
        assertTrue(HiveJdbcDriverBundle.coordinatesForVersion("3.1.2").stream()
                .anyMatch(item -> item.contains("hive-service-rpc")));
    }

    @Test
    void detectsHiveArtifacts() {
        assertTrue(HiveJdbcDriverBundle.isHiveMavenArtifact(
                JdbcMavenCoordinate.parse("org.apache.hive:hive-jdbc:3.1.2")));
        assertFalse(HiveJdbcDriverBundle.isHiveMavenArtifact(
                JdbcMavenCoordinate.parse("com.mysql:mysql-connector-j:8.4.0")));
    }
}
