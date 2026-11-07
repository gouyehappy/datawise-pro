package org.apache.datawise.backend.connector;

import org.apache.datawise.backend.connector.jdbc.GenericJdbcDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@ExtendWith(MockitoExtension.class)
class ConnectorRegistryTest {

    @Mock
    private JdbcConnectorOperations jdbcConnectorOperations;

    @Test
    void resolveRejectsPluginOwnedOracleWithoutConnectorJar() {
        ConnectorRegistry registry = new ConnectorRegistry(List.of(
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("oracle"));
    }

    @Test
    void resolveFallsBackToGenericJdbcForUnknownJdbcType() {
        ConnectorRegistry registry = new ConnectorRegistry(List.of(
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)));
        assertEquals("jdbc-generic", registry.resolve("customdb").id());
    }

    @Test
    void resolveFallsBackToGenericJdbcForStarrocksWhenPluginPresent() {
        DataSourceConnector starRocks = stubConnector("jdbc-starrocks", Set.of("starrocks"));
        ConnectorRegistry registry = new ConnectorRegistry(List.of(
                starRocks,
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)));
        assertEquals("jdbc-starrocks", registry.resolve("starrocks").id());
    }

    @Test
    void resolveRejectsPluginOwnedTypesWithoutConnectorJar() {
        ConnectorRegistry registry = new ConnectorRegistry(List.of(
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("mysql"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("postgresql"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("redis"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("starrocks"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("doris"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("mongodb"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("oracle"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("dameng"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("dm"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("clickhouse"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("gbase8a"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("elasticsearch"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("kylin"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("greenplum"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("oceanbase"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("kingbase"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("opengauss"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("highgo"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("db2"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("sqlite"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("presto"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("oscar"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("tidb"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("tdengine"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("sybase"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("phoenix"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("cachedb"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("h2"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("hsql"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("flink"));
        assertThrows(IllegalArgumentException.class, () -> registry.resolve("gaussdb"));
    }

    @Test
    void resolveFallsBackToGenericJdbcForGenericType() {
        ConnectorRegistry registry = new ConnectorRegistry(List.of(
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)));
        assertEquals("jdbc-generic", registry.resolve("generic").id());
        assertEquals("jdbc-generic", registry.resolve("other").id());
    }

    @Test
    void replaceAll_hotReloadsConnectorsAndClearsResolveCache() {
        ConnectorRegistry registry = new ConnectorRegistry(List.of(
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)));
        assertEquals("jdbc-generic", registry.resolve("customdb").id());

        DataSourceConnector plugin = stubConnector("jdbc-oracle", Set.of("oracle"));
        registry.replaceAll(List.of(
                plugin,
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)));

        assertEquals("jdbc-oracle", registry.resolve("oracle").id());
        assertEquals("jdbc-generic", registry.resolve("customdb").id());
    }

    @Test
    void merge_prefersPluginConnectorOverClasspathDuplicate() {
        DataSourceConnector pluginMysql = stubConnector("jdbc-mysql", Set.of("mysql"));
        DataSourceConnector classpathMysql = stubConnector("jdbc-mysql", Set.of("mysql"));
        ConnectorRegistry registry = ConnectorRegistry.merge(
                List.of(pluginMysql),
                List.of(classpathMysql, new GenericJdbcDataSourceConnector(jdbcConnectorOperations)));
        assertEquals("jdbc-mysql", registry.resolve("mysql").id());
        assertEquals(2, registry.all().size());
    }

    @Test
    void sort_prefersLowerPriorityConnectorWhenMultipleSupportSameDbType() {
        DataSourceConnector generic = stubConnector("jdbc-generic", Set.of("mysql"));
        DataSourceConnector mysql = stubConnector("jdbc-mysql", Set.of("mysql"));
        ConnectorRegistry registry = new ConnectorRegistry(List.of(generic, mysql));
        assertEquals("jdbc-mysql", registry.resolve("mysql").id());
        assertEquals("jdbc-mysql", registry.all().get(0).id());
        assertEquals("jdbc-generic", registry.all().get(1).id());
    }

    @Test
    void sort_ordersRedisBeforeJdbcConnectors() {
        DataSourceConnector redis = stubConnector("redis", Set.of("redis"));
        DataSourceConnector mysql = stubConnector("jdbc-mysql", Set.of("mysql"));
        ConnectorRegistry registry = new ConnectorRegistry(List.of(mysql, redis));
        assertEquals("redis", registry.all().get(0).id());
        assertEquals("jdbc-mysql", registry.all().get(1).id());
    }

    @Test
    void sort_usesConnectorDeclaredPriority() {
        DataSourceConnector specialized = stubConnector("custom-mysql", Set.of("mysql"), 15);
        DataSourceConnector mysql = stubConnector("jdbc-mysql", Set.of("mysql"), 20);
        ConnectorRegistry registry = new ConnectorRegistry(List.of(mysql, specialized));
        assertEquals("custom-mysql", registry.resolve("mysql").id());
    }

    private static DataSourceConnector stubConnector(String id, Set<String> dbTypes) {
        return stubConnector(id, dbTypes, defaultPriority(id));
    }

    private static DataSourceConnector stubConnector(String id, Set<String> dbTypes, int priority) {
        return new DataSourceConnector() {

            @Override
            public String id() {
                return id;
            }

            @Override
            public int priority() {
                return priority;
            }

            @Override
            public boolean supports(String dbType) {
                return dbType != null && dbTypes.contains(dbType.toLowerCase());
            }

            @Override
            public EnumSet<ConnectorCapability> capabilities() {
                return EnumSet.noneOf(ConnectorCapability.class);
            }
        };
    }

    private static int defaultPriority(String id) {
        return switch (id) {
            case "redis" -> 10;
            case "jdbc-mysql" -> 20;
            case "jdbc-postgresql" -> 21;
            case "jdbc-starrocks" -> 22;
            case "jdbc-doris" -> 23;
            case "jdbc-generic" -> 1000;
            default -> 500;
        };
    }
}
