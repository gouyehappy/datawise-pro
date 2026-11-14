package org.apache.datawise.backend.controller.explorer;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.database.explorer.CreateNamespaceService;
import org.apache.datawise.backend.database.explorer.DialectOptionsService;
import org.apache.datawise.backend.database.explorer.ExplorerChildLoadOutcome;
import org.apache.datawise.backend.database.explorer.ExplorerConnectionAdminService;
import org.apache.datawise.backend.database.explorer.ExplorerConnectionLifecycleService;
import org.apache.datawise.backend.database.explorer.ExplorerJenkinsService;
import org.apache.datawise.backend.database.explorer.ExplorerKafkaService;
import org.apache.datawise.backend.database.explorer.ExplorerKubernetesService;
import org.apache.datawise.backend.database.explorer.ExplorerLoadMetrics;
import org.apache.datawise.backend.database.explorer.ExplorerNacosService;
import org.apache.datawise.backend.database.explorer.ExplorerPolarisService;
import org.apache.datawise.backend.database.explorer.ExplorerRedisService;
import org.apache.datawise.backend.database.explorer.ExplorerSchemaService;
import org.apache.datawise.backend.database.explorer.ExplorerTreeLoadResult;
import org.apache.datawise.backend.database.explorer.ExplorerYarnService;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.ConnectionResult;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.CreateConnectionRequest;
import org.apache.datawise.backend.domain.CreateDatabaseRequest;
import org.apache.datawise.backend.domain.CreateNamespaceResult;
import org.apache.datawise.backend.domain.GroupResult;
import org.apache.datawise.backend.domain.ImportConnectionsRequest;
import org.apache.datawise.backend.domain.ImportConnectionsResult;
import org.apache.datawise.backend.domain.JenkinsInfoDto;
import org.apache.datawise.backend.domain.K8sClusterInfoDto;
import org.apache.datawise.backend.domain.KafkaTopicsResultDto;
import org.apache.datawise.backend.domain.NacosInfoDto;
import org.apache.datawise.backend.domain.PolarisInfoDto;
import org.apache.datawise.backend.domain.RedisKeyDetailDto;
import org.apache.datawise.backend.domain.TreePayload;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.domain.YarnClusterInfoDto;
import org.apache.datawise.backend.security.ApiTokenScopes;
import org.apache.datawise.backend.security.ExplorerFeatureGate;
import org.apache.datawise.backend.security.RequiresExplorerGate;
import org.apache.datawise.backend.security.RequiresExplorerNodeDelete;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.server.pack.EntitlementService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExplorerControllerBaselineTest {

    private final ExplorerSchemaService schemaService = mock(ExplorerSchemaService.class);
    private final ExplorerLoadMetrics loadMetrics = mock(ExplorerLoadMetrics.class);
    private final ExplorerRedisService redisService = mock(ExplorerRedisService.class);
    private final ExplorerKafkaService kafkaService = mock(ExplorerKafkaService.class);
    private final ExplorerYarnService yarnService = mock(ExplorerYarnService.class);
    private final ExplorerJenkinsService jenkinsService = mock(ExplorerJenkinsService.class);
    private final ExplorerKubernetesService kubernetesService = mock(ExplorerKubernetesService.class);
    private final ExplorerNacosService nacosService = mock(ExplorerNacosService.class);
    private final ExplorerPolarisService polarisService = mock(ExplorerPolarisService.class);
    private final ExplorerConnectionAdminService connectionAdminService = mock(ExplorerConnectionAdminService.class);
    private final ExplorerConnectionLifecycleService connectionLifecycleService = mock(ExplorerConnectionLifecycleService.class);
    private final CreateNamespaceService createNamespaceService = mock(CreateNamespaceService.class);
    private final DialectOptionsService dialectOptionsService = mock(DialectOptionsService.class);
    private final EntitlementService entitlementService = mock(EntitlementService.class);

    private final ExplorerController controller = new ExplorerController(
            schemaService,
            loadMetrics,
            connectionAdminService,
            connectionLifecycleService,
            createNamespaceService,
            dialectOptionsService,
            entitlementService
    );

    private final ExplorerRedisController redisController = new ExplorerRedisController(redisService);
    private final ExplorerKafkaController kafkaController = new ExplorerKafkaController(kafkaService);
    private final ExplorerYarnController yarnController = new ExplorerYarnController(yarnService);
    private final ExplorerJenkinsController jenkinsController = new ExplorerJenkinsController(jenkinsService);
    private final ExplorerKubernetesController kubernetesController = new ExplorerKubernetesController(kubernetesService);
    private final ExplorerNacosController nacosController = new ExplorerNacosController(nacosService);
    private final ExplorerPolarisController polarisController = new ExplorerPolarisController(polarisService);

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void fetchTreeDelegatesRefreshFlag() {
        TreeNode node = new TreeNode();
        node.setId("conn-1");
        TreePayload expected = new TreePayload(List.of(node));
        when(schemaService.fetchTree(true)).thenReturn(List.of(node));

        ApiResponse<TreePayload> response = controller.fetchTree(true);

        assertEquals(0, response.code());
        assertEquals(expected, response.data());
        verify(schemaService).fetchTree(true);
    }

    @Test
    void fetchConnectionDelegatesToSchemaService() {
        ConnectionConfig expected = mock(ConnectionConfig.class);
        when(schemaService.getConnection("conn-1")).thenReturn(expected);

        assertSame(expected, controller.fetchConnection("conn-1").data());
    }

    @Test
    void connectConnectionEnforcesConnectorEntitlement() {
        ConnectionConfig config = mock(ConnectionConfig.class);
        ConnectionTestResult expected = mock(ConnectionTestResult.class);
        when(schemaService.getConnection("conn-1")).thenReturn(config);
        when(config.getDbType()).thenReturn("mysql");
        when(connectionLifecycleService.connect("conn-1")).thenReturn(expected);

        assertSame(expected, controller.connectConnection("conn-1").data());
        verify(entitlementService).requireConnector("mysql");
        verify(connectionLifecycleService).connect("conn-1");
    }

    @Test
    void disconnectConnectionReturnsOk() {
        ApiResponse<Void> response = controller.disconnectConnection("conn-1");

        assertEquals(0, response.code());
        assertNull(response.data());
        verify(connectionLifecycleService).disconnect("conn-1");
    }

    @Test
    void explorerGatesAreDeclaredOnMutationEndpoints() throws Exception {
        assertGate("fetchConnection", ExplorerFeatureGate.CONNECTION);
        assertGate("connectConnection", ExplorerFeatureGate.CONNECTION);
        assertGate("disconnectConnection", ExplorerFeatureGate.CONNECTION);
        assertGate("createGroup", ExplorerFeatureGate.CATALOG_MUTATION);
        assertGate("updateGroup", ExplorerFeatureGate.CATALOG_MUTATION);
        assertGate("createDatabase", ExplorerFeatureGate.DANGEROUS);
        assertGate("createConnection", ExplorerFeatureGate.CATALOG_MUTATION);
        assertGate("importConnections", ExplorerFeatureGate.EXPORT);
        assertGate("reorder", ExplorerFeatureGate.CATALOG_MUTATION);

        Method deleteNode = ExplorerController.class.getDeclaredMethod("deleteNode", String.class);
        assertNotNull(deleteNode.getAnnotation(RequiresExplorerNodeDelete.class));
    }

    private static void assertGate(String methodName, ExplorerFeatureGate expected) throws Exception {
        Method method = null;
        for (Method candidate : ExplorerController.class.getDeclaredMethods()) {
            if (candidate.getName().equals(methodName)) {
                method = candidate;
                break;
            }
        }
        assertNotNull(method, methodName);
        RequiresExplorerGate gate = method.getAnnotation(RequiresExplorerGate.class);
        assertNotNull(gate, methodName + " missing @RequiresExplorerGate");
        assertEquals(expected, gate.value());
    }

    @Test
    void listPooledConnectionsDelegates() {
        when(connectionLifecycleService.listPooledConnectionIds()).thenReturn(List.of("conn-1"));

        assertEquals(List.of("conn-1"), controller.listPooledConnections().data());
    }

    @Test
    void loadChildrenReturnsPayloadWithOkStatus() {
        TreeNode node = new TreeNode();
        node.setId("db-1");
        TreePayload payload = new TreePayload(List.of(node));
        ExplorerTreeLoadResult result = new ExplorerTreeLoadResult(payload, "etag-1");
        ExplorerChildLoadOutcome outcome = new ExplorerChildLoadOutcome(result, false, false);
        when(schemaService.loadChildrenWithCaching(eq("conn-1"), eq("db-1"), any(), isNull()))
                .thenReturn(outcome);

        ResponseEntity<ApiResponse<TreePayload>> response =
                controller.loadChildren("conn-1", "db-1", null, false, null, null, true, null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(0, response.getBody().code());
        assertEquals(payload, response.getBody().data());
        verify(loadMetrics).record(outcome);
    }

    @Test
    void loadChildrenReturnsNotModifiedWhenOutcomeSaysSo() {
        ExplorerChildLoadOutcome outcome = new ExplorerChildLoadOutcome(null, true, false);
        when(schemaService.loadChildrenWithCaching(eq("conn-1"), eq("db-1"), any(), isNull()))
                .thenReturn(outcome);

        ResponseEntity<ApiResponse<TreePayload>> response =
                controller.loadChildren("conn-1", "db-1", null, false, null, null, true, null);

        assertEquals(HttpStatus.NOT_MODIFIED, response.getStatusCode());
        assertNull(response.getBody());
        verify(loadMetrics).record(outcome);
    }

    @Test
    void middlewareEndpointsDelegateToTheirServices() {
        RedisKeyDetailDto redis = mock(RedisKeyDetailDto.class);
        KafkaTopicsResultDto kafka = mock(KafkaTopicsResultDto.class);
        YarnClusterInfoDto yarn = mock(YarnClusterInfoDto.class);
        JenkinsInfoDto jenkins = mock(JenkinsInfoDto.class);
        K8sClusterInfoDto k8s = mock(K8sClusterInfoDto.class);
        NacosInfoDto nacos = mock(NacosInfoDto.class);
        PolarisInfoDto polaris = mock(PolarisInfoDto.class);
        when(redisService.getRedisKeyDetail("conn-1", "k", 0)).thenReturn(redis);
        when(kafkaService.listTopics("conn-1", null, null)).thenReturn(kafka);
        when(yarnService.clusterInfo("conn-1")).thenReturn(yarn);
        when(jenkinsService.info("conn-1")).thenReturn(jenkins);
        when(kubernetesService.clusterInfo("conn-1")).thenReturn(k8s);
        when(nacosService.info("conn-1")).thenReturn(nacos);
        when(polarisService.info("conn-1")).thenReturn(polaris);

        assertSame(redis, redisController.fetchRedisKey("conn-1", "k", 0).data());
        assertSame(kafka, kafkaController.listKafkaTopics("conn-1", null, null).data());
        assertSame(yarn, yarnController.yarnClusterInfo("conn-1").data());
        assertSame(jenkins, jenkinsController.jenkinsInfo("conn-1").data());
        assertSame(k8s, kubernetesController.kubernetesClusterInfo("conn-1").data());
        assertSame(nacos, nacosController.nacosInfo("conn-1").data());
        assertSame(polaris, polarisController.polarisInfo("conn-1").data());
    }

    @Test
    void createGroupEnforcesMutationAndDelegates() {
        GroupResult expected = mock(GroupResult.class);
        when(connectionAdminService.createGroup("New group", null)).thenReturn(expected);

        assertSame(expected, controller.createGroup(Map.of("label", "New group")).data());
    }

    @Test
    void updateGroupWrapsTreePayload() {
        TreeNode node = new TreeNode();
        node.setId("g-1");
        when(connectionAdminService.updateGroup("g-1", "Renamed")).thenReturn(List.of(node));

        ApiResponse<TreePayload> response = controller.updateGroup("g-1", Map.of("label", "Renamed"));

        assertEquals(0, response.code());
        assertEquals(List.of(node), response.data().tree());
    }

    @Test
    void createDatabaseRequiresSqlAccess() {
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.SQL));
        CreateDatabaseRequest request = mock(CreateDatabaseRequest.class);
        CreateNamespaceResult expected = mock(CreateNamespaceResult.class);
        when(createNamespaceService.createDatabase("conn-1", request)).thenReturn(expected);

        assertSame(expected, controller.createDatabase("conn-1", request).data());
        verify(createNamespaceService).createDatabase("conn-1", request);
    }

    @Test
    void createConnectionEnforcesConnectorEntitlement() {
        ConnectionConfig config = mock(ConnectionConfig.class);
        CreateConnectionRequest request = mock(CreateConnectionRequest.class);
        ConnectionResult expected = mock(ConnectionResult.class);
        when(request.config()).thenReturn(config);
        when(request.groupId()).thenReturn("g-1");
        when(config.getDbType()).thenReturn("postgresql");
        when(connectionAdminService.createConnection(config, "g-1")).thenReturn(expected);

        assertSame(expected, controller.createConnection(request).data());
        verify(entitlementService).requireConnector("postgresql");
    }

    @Test
    void importConnectionsChecksEntitlementForEveryConfig() {
        ConnectionConfig first = mock(ConnectionConfig.class);
        ConnectionConfig second = mock(ConnectionConfig.class);
        ImportConnectionsRequest request = mock(ImportConnectionsRequest.class);
        ImportConnectionsResult expected = mock(ImportConnectionsResult.class);
        when(request.configs()).thenReturn(List.of(first, second));
        when(first.getDbType()).thenReturn("mysql");
        when(second.getDbType()).thenReturn("oracle");
        when(connectionAdminService.importConnections(List.of(first, second))).thenReturn(expected);

        assertSame(expected, controller.importConnections(request).data());
        verify(entitlementService).requireConnector("mysql");
        verify(entitlementService).requireConnector("oracle");
    }

    @Test
    void moveConnectionRequiresGroupId() {
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> controller.moveConnection("conn-1", Map.of())
        );
        assertEquals("groupId is required", error.getMessage());
    }

    @Test
    void reorderRequiresIdsAndPosition() {
        IllegalArgumentException missingIds = assertThrows(
                IllegalArgumentException.class,
                () -> controller.reorder(Map.of("position", "before"))
        );
        assertEquals("nodeId and targetId are required", missingIds.getMessage());

        IllegalArgumentException missingPosition = assertThrows(
                IllegalArgumentException.class,
                () -> controller.reorder(Map.of("nodeId", "a", "targetId", "b"))
        );
        assertEquals("position is required", missingPosition.getMessage());
    }

    @Test
    void reorderWrapsTreePayload() {
        TreeNode node = new TreeNode();
        node.setId("g-1");
        when(connectionAdminService.reorder("g-1", "g-2", "before")).thenReturn(List.of(node));

        ApiResponse<TreePayload> response = controller.reorder(Map.of(
                "nodeId", "g-1",
                "targetId", "g-2",
                "position", "before"
        ));

        assertEquals(0, response.code());
        assertEquals(List.of(node), response.data().tree());
    }
}
