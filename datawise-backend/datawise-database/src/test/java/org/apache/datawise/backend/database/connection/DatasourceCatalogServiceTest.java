package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.common.DatasourceNotAvailableException;
import org.apache.datawise.backend.config.ConnectorDownloadProperties;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.connector.ConnectorRegistry;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.connector.hook.SqlExecutionHookRunner;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginLoader;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginRuntime;
import org.apache.datawise.backend.connector.jdbc.GenericJdbcDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.MysqlDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PostgresqlDataSourceConnector;
import org.apache.datawise.backend.connector.redis.RedisConnectorOperations;
import org.apache.datawise.backend.connector.redis.RedisDataSourceConnector;
import org.apache.datawise.backend.domain.ConnectorMarketEntryDto;
import org.apache.datawise.backend.domain.DatasourceDefinitionDto;
import org.apache.datawise.backend.ops.DatabaseOpsRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(MockitoExtension.class)
class DatasourceCatalogServiceTest {

    @Mock
    private JdbcConnectorOperations jdbcConnectorOperations;

    @Mock
    private PostgresqlConnectorOperations postgresqlConnectorOperations;

    @Mock
    private RedisConnectorOperations redisConnectorOperations;

    @Mock
    private DatabaseOpsRegistry opsRegistry;

    private DatasourceCatalogService service;

    @BeforeEach
    void setUp() {
        ConnectorRegistry registry = new ConnectorRegistry(List.of(
                new MysqlDataSourceConnector(jdbcConnectorOperations),
                new PostgresqlDataSourceConnector(jdbcConnectorOperations, postgresqlConnectorOperations),
                new RedisDataSourceConnector(redisConnectorOperations),
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)
        ));
        service = new DatasourceCatalogService(
                connectorFacade(registry),
                opsRegistry,
                new ConnectorDownloadProperties()
        );
    }

    @Test
    void listMarket_marksUnavailableCatalogTypes() {
        List<ConnectorMarketEntryDto> market = service.listMarket();
        assertFalse(market.isEmpty());

        ConnectorMarketEntryDto mysql = market.stream()
                .filter(entry -> "mysql".equals(entry.id()))
                .findFirst()
                .orElseThrow();
        assertTrue(mysql.available());

        ConnectorMarketEntryDto oracle = market.stream()
                .filter(entry -> "oracle".equals(entry.id()))
                .findFirst()
                .orElseThrow();
        assertFalse(oracle.available());
        assertNotNull(oracle.installHint());
    }

    @Test
    void listAvailable_includesSeededImplementedTypes() {
        List<String> ids = service.listAvailable().stream().map(DatasourceDefinitionDto::id).toList();
        assertTrue(ids.contains("mysql"));
        assertTrue(ids.contains("postgresql"));
        assertTrue(ids.contains("redis"));
        assertTrue(ids.contains("generic"));
        assertTrue(ids.contains("other"));
    }

    @Test
    void listAvailable_excludesUnseededTypesLikeOracle() {
        List<String> ids = service.listAvailable().stream().map(DatasourceDefinitionDto::id).toList();
        assertFalse(ids.contains("oracle"));
    }

    @Test
    void findById_returnsMysqlDefaults() {
        DatasourceDefinitionDto mysql = service.findById("mysql").orElseThrow();
        assertTrue(mysql.jdbcDriverRequired());
        assertTrue(mysql.defaultDriverMaven().contains("mysql-connector-j"));
        assertTrue(mysql.defaultDriverClass().contains("mysql.cj.jdbc.Driver"));
    }

    @Test
    void listAvailable_excludesTypesWithoutConnectorJar() {
        ConnectorRegistry registryWithoutPlugins = new ConnectorRegistry(List.of(
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)
        ));
        DatasourceCatalogService catalogWithoutPlugins =
                new DatasourceCatalogService(
                        connectorFacade(registryWithoutPlugins),
                        opsRegistry,
                        new ConnectorDownloadProperties()
                );
        List<String> ids = catalogWithoutPlugins.listAvailable().stream().map(DatasourceDefinitionDto::id).toList();
        assertFalse(ids.contains("mysql"));
        assertFalse(ids.contains("postgresql"));
        assertFalse(ids.contains("redis"));
    }

    @Test
    void requireAvailable_rejectsMissingPlugin() {
        ConnectorRegistry registryWithoutPlugins = new ConnectorRegistry(List.of(
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)
        ));
        DatasourceCatalogService catalogWithoutPlugins =
                new DatasourceCatalogService(
                        connectorFacade(registryWithoutPlugins),
                        opsRegistry,
                        new ConnectorDownloadProperties()
                );
        assertThrows(DatasourceNotAvailableException.class, () -> catalogWithoutPlugins.requireAvailable("mysql"));
    }

    @Test
    void requireAvailable_allowsCommunityPluginDbTypeWithoutJdbcConnector() {
        ConnectorRegistry registryWithoutPlugins = new ConnectorRegistry(List.of(
                new GenericJdbcDataSourceConnector(jdbcConnectorOperations)
        ));
        DatasourceCatalogService catalogWithoutPlugins =
                new DatasourceCatalogService(
                        connectorFacade(registryWithoutPlugins),
                        opsRegistry,
                        new ConnectorDownloadProperties()
                );
        catalogWithoutPlugins.requireAvailable("plugin");
        catalogWithoutPlugins.requireAvailable("PLUGIN");
    }

    private static ConnectorFacade connectorFacade(ConnectorRegistry registry) {
        try {
            Path temp = Files.createTempDirectory("dw-catalog-test");
            ConnectorPluginLoader pluginLoader = new ConnectorPluginLoader(temp.toString(), "plugins");
            ConnectorPluginRuntime runtime = new ConnectorPluginRuntime(
                    registry,
                    pluginLoader,
                    List.of(),
                    jdbcOpsStub(),
                    new ConnectorPluginContributionHolder(),
                    new SqlExecutionHookRunner(List.of())
            );
            return new ConnectorFacade(
                    null,
                    null,
                    null,
                    null,
                    new ConnectorCatalogAccess(registry, pluginLoader, runtime),
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
            );
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static JdbcConnectorOperations jdbcOpsStub() {
        return org.mockito.Mockito.mock(JdbcConnectorOperations.class);
    }
}
