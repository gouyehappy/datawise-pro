package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.config.ConnectionProbeProperties;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.DatasourceDefinitionDto;
import org.apache.datawise.backend.domain.JdbcDriverResolveRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectionTestServiceTest {

    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorCatalogAccess catalogAccess;
    @Mock
    private DatasourceCatalogService datasourceCatalogService;
    @Mock
    private JdbcDriverService jdbcDriverService;

    private ConnectionTestService service;

    @BeforeEach
    void setUp() {
        ConnectionProbeProperties probeProperties = new ConnectionProbeProperties();
        probeProperties.setAllowPrivateNetworks(false);
        service = new ConnectionTestService(connectorFacade, datasourceCatalogService, jdbcDriverService, probeProperties);
    }

    @Test
    void test_rejectsMissingHost() {
        ConnectionConfig config = baseConfig();
        config.setHost("  ");

        ConnectionTestResult result = service.test(config);

        assertFalse(result.ok());
        assertEquals("Host is required", result.message());
        verify(catalogAccess, never()).testConnection(any());
    }

    @Test
    void test_rejectsUnavailableDatasourceType() {
        ConnectionConfig config = baseConfig();
        when(datasourceCatalogService.findById("mysql")).thenReturn(Optional.empty());

        ConnectionTestResult result = service.test(config);

        assertFalse(result.ok());
        assertEquals("Datasource type is not available: mysql", result.message());
        verify(catalogAccess, never()).testConnection(any());
    }

    @Test
    void test_rejectsMissingSshHostWhenTunnelEnabled() {
        ConnectionConfig config = baseConfig();
        config.setSshEnabled(true);
        config.setSshUser("deploy");
        config.setSshPassword("secret");
        when(datasourceCatalogService.findById("mysql")).thenReturn(Optional.of(mysqlDatasource()));

        ConnectionTestResult result = service.test(config);

        assertFalse(result.ok());
        assertEquals("SSH host is required when SSH tunnel is enabled", result.message());
        verify(catalogAccess, never()).testConnection(any());
    }

    @Test
    void test_rejectsPrivateHostWhenRestricted() {
        ConnectionConfig config = baseConfig();
        config.setHost("10.0.0.5");

        ConnectionTestResult result = service.test(config);

        assertFalse(result.ok());
        assertTrue(result.message().contains("private or link-local"));
        verify(catalogAccess, never()).testConnection(any());
    }

    @Test
    void test_allowsPrivateHostWhenConfigured() throws Exception {
        ConnectionProbeProperties probeProperties = new ConnectionProbeProperties();
        probeProperties.setAllowPrivateNetworks(true);
        ConnectionTestService permissiveService = new ConnectionTestService(
                connectorFacade,
                datasourceCatalogService,
                jdbcDriverService,
                probeProperties
        );
        ConnectionConfig config = baseConfig();
        config.setHost("192.0.2.56");
        config.setDbType("kafka");
        config.setPort("9092");
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(datasourceCatalogService.findById("kafka")).thenReturn(Optional.of(kafkaDatasource()));
        when(catalogAccess.testConnection(any())).thenReturn(new ConnectionTestResult(true, "OK", 12));

        ConnectionTestResult result = permissiveService.test(config);

        assertTrue(result.ok());
        verify(catalogAccess).testConnection(any());
    }

    @Test
    void test_allowsLocalhost() throws Exception {
        ConnectionConfig config = baseConfig();
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(datasourceCatalogService.findById("mysql")).thenReturn(Optional.of(mysqlDatasource()));
        when(jdbcDriverService.resolve(any(JdbcDriverResolveRequest.class)))
                .thenReturn(new org.apache.datawise.backend.domain.JdbcDriverResolveResult(
                        "com.mysql:mysql-connector-j:8.4.0",
                        "com.mysql.cj.jdbc.Driver",
                        "/tmp/driver.jar",
                        false,
                        true
                ));
        when(catalogAccess.testConnection(any())).thenReturn(new ConnectionTestResult(true, "OK", 12));

        ConnectionTestResult result = service.test(config);

        assertTrue(result.ok());
        assertEquals("OK", result.message());
        verify(catalogAccess).testConnection(any());
    }

    @Test
    void test_delegatesToCatalogWhenDatasourceAvailable() throws Exception {
        ConnectionConfig config = baseConfig();
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(datasourceCatalogService.findById("mysql")).thenReturn(Optional.of(mysqlDatasource()));
        when(jdbcDriverService.resolve(any(JdbcDriverResolveRequest.class)))
                .thenReturn(new org.apache.datawise.backend.domain.JdbcDriverResolveResult(
                        "com.mysql:mysql-connector-j:8.4.0",
                        "com.mysql.cj.jdbc.Driver",
                        "/tmp/driver.jar",
                        false,
                        true
                ));
        when(catalogAccess.testConnection(any())).thenReturn(new ConnectionTestResult(true, "OK", 12));

        ConnectionTestResult result = service.test(config);

        assertTrue(result.ok());
        assertEquals("OK", result.message());
        verify(catalogAccess).testConnection(any());
    }

    @Test
    void test_allowsKubernetesTokenWithoutUsername() {
        ConnectionProbeProperties probeProperties = new ConnectionProbeProperties();
        probeProperties.setAllowPrivateNetworks(true);
        ConnectionTestService permissiveService = new ConnectionTestService(
                connectorFacade,
                datasourceCatalogService,
                jdbcDriverService,
                probeProperties
        );
        ConnectionConfig config = baseConfig();
        config.setDbType("kubernetes");
        config.setHost("api.example.com");
        config.setPort("6443");
        config.setAuth("token");
        config.setUser("");
        config.setPassword("bearer-token-value");
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(datasourceCatalogService.findById("kubernetes")).thenReturn(Optional.of(kubernetesDatasource()));
        when(catalogAccess.testConnection(any())).thenReturn(new ConnectionTestResult(true, "OK", 12));

        ConnectionTestResult result = permissiveService.test(config);

        assertTrue(result.ok());
        verify(catalogAccess).testConnection(any());
    }

    @Test
    void test_rejectsKubernetesWithoutToken() {
        ConnectionConfig config = baseConfig();
        config.setDbType("kubernetes");
        config.setHost("api.example.com");
        config.setPort("6443");
        config.setAuth("token");
        config.setUser("");
        config.setPassword("  ");

        ConnectionTestResult result = service.test(config);

        assertFalse(result.ok());
        assertEquals("Bearer token is required", result.message());
        verify(catalogAccess, never()).testConnection(any());
    }

    private static ConnectionConfig baseConfig() {
        ConnectionConfig config = new ConnectionConfig();
        config.setName("probe");
        config.setDbType("mysql");
        config.setHost("127.0.0.1");
        config.setPort("3306");
        config.setAuth("NONE");
        config.setDatabase("shop");
        config.setDriver("com.mysql:mysql-connector-j:8.4.0");
        config.setDriverClass("com.mysql.cj.jdbc.Driver");
        return config;
    }

    private static DatasourceDefinitionDto mysqlDatasource() {
        return new DatasourceDefinitionDto(
                "mysql",
                "MySQL",
                true,
                "3306",
                true,
                "com.mysql:mysql-connector-j:8.4.0",
                "com.mysql.cj.jdbc.Driver",
                List.of("JDBC"),
                "`"
        );
    }

    private static DatasourceDefinitionDto kafkaDatasource() {
        return new DatasourceDefinitionDto(
                "kafka",
                "Kafka",
                false,
                "9092",
                false,
                null,
                null,
                List.of("MESSAGE_BROKER"),
                null
        );
    }

    private static DatasourceDefinitionDto kubernetesDatasource() {
        return new DatasourceDefinitionDto(
                "kubernetes",
                "Kubernetes",
                false,
                "6443",
                false,
                null,
                null,
                List.of("KUBERNETES"),
                null
        );
    }
}
