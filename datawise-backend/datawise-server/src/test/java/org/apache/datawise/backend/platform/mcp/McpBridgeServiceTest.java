package org.apache.datawise.backend.platform.mcp;

import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.common.pack.AiTableTagFilter;
import org.apache.datawise.backend.common.pack.AnalysisCanvasRerun;
import org.apache.datawise.backend.common.pack.SemanticMetricQuery;
import org.apache.datawise.backend.ai.schema.AiSchemaContextService;
import org.apache.datawise.backend.database.drift.SchemaDriftService;
import org.apache.datawise.backend.database.federated.FederatedSqlGenerator;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.database.table.TableDataService;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.platform.mcp.audit.McpCallAuditService;
import org.apache.datawise.backend.platform.mcp.confirm.ConfirmGateService;
import org.apache.datawise.backend.platform.mcp.confirm.ConfirmTicket;
import org.apache.datawise.backend.platform.sql.SqlReviewOrchestrator;
import org.apache.datawise.backend.platform.workbenchcontext.WorkbenchContextStore;
import org.apache.datawise.backend.security.ApiTokenScopes;
import org.apache.datawise.backend.security.HeadlessMigrationAuth;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.apache.datawise.backend.service.ProductionWriteGuardService;
import org.apache.datawise.backend.service.tenant.TenantQuotaService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class McpBridgeServiceTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void executeReadonlyRejectsApiTokenWithoutSqlScope() {
        SqlService sqlService = mock(SqlService.class);
        FeaturePermissionAccess permissions = mock(FeaturePermissionAccess.class);
        McpBridgeService service = newService(sqlService, mock(AiAccessGate.class), mock(TenantQuotaService.class), permissions);
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.MIGRATION));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.executeReadonly(new ExecuteSqlRequest(
                        "select 1",
                        "conn-1",
                        "app",
                        100,
                        null,
                        null,
                        null,
                        "mcp"
                ))
        );

        assertEquals(HeadlessMigrationAuth.API_TOKEN_FORBIDDEN, error.getMessage());
        verifyNoInteractions(sqlService);
        verifyNoInteractions(permissions);
    }

    @Test
    void executeReadonlyEnforcesDesktopSqlPermissionForSession() {
        SqlService sqlService = mock(SqlService.class);
        FeaturePermissionAccess permissions = mock(FeaturePermissionAccess.class);
        doThrow(new IllegalArgumentException("permission denied: workbench.console.run"))
                .when(permissions).requireSqlExecute(anyString());
        McpBridgeService service = newService(sqlService, mock(AiAccessGate.class), mock(TenantQuotaService.class), permissions);
        UserContext.set(9L, false, "session-1");

        assertThrows(
                IllegalArgumentException.class,
                () -> service.executeReadonly(new ExecuteSqlRequest(
                        "select 1",
                        "conn-1",
                        "app",
                        100,
                        null,
                        null,
                        null,
                        "mcp"
                ))
        );

        verify(permissions).requireSqlExecute("select 1");
        verifyNoInteractions(sqlService);
    }

    @Test
    void listConnectionsRequiresNavDatabasePermission() {
        FeaturePermissionAccess permissions = mock(FeaturePermissionAccess.class);
        doThrow(new IllegalArgumentException("permission denied: nav.database"))
                .when(permissions).requirePermission(UserFeaturePermission.NAV_DATABASE);
        McpBridgeService service = newService(
                mock(SqlService.class),
                mock(AiAccessGate.class),
                mock(TenantQuotaService.class),
                permissions
        );
        UserContext.set(9L, false, "session-1");

        assertThrows(IllegalArgumentException.class, service::listConnections);
        verify(permissions).requirePermission(UserFeaturePermission.NAV_DATABASE);
    }

    @Test
    @SuppressWarnings("unchecked")
    void proposeOpenConsoleMarksProdApprovalForSharedProductionWrite() {
        ConnectionVisibilityService visibility = mock(ConnectionVisibilityService.class);
        ProductionWriteGuardService guard = mock(ProductionWriteGuardService.class);
        ConfirmGateService confirmGate = mock(ConfirmGateService.class);
        FeaturePermissionAccess permissions = mock(FeaturePermissionAccess.class);
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-prod");
        connection.setEnv("prod");
        when(visibility.resolveConnectionEntity("conn-prod")).thenReturn(Optional.of(connection));
        when(guard.requiresProductionApproval(eq(9L), eq(connection), anyString())).thenReturn(true);
        when(confirmGate.propose(anyString(), anyString(), anyString(), any(), any()))
                .thenReturn(Map.of("dw_confirm", true));

        McpBridgeService service = new McpBridgeService(
                visibility,
                mock(TableDetailService.class),
                mock(SqlService.class),
                mock(SqlReviewOrchestrator.class),
                mock(SchemaDriftService.class),
                mock(AiTableTagFilter.class),
                mock(SemanticMetricQuery.class),
                mock(AnalysisCanvasRerun.class),
                mock(FederatedSqlGenerator.class),
                mock(AiAccessGate.class),
                mock(TenantQuotaService.class),
                mock(WorkbenchContextStore.class),
                confirmGate,
                permissions,
                guard,
                mock(McpAccessPolicyService.class),
                mock(McpCallAuditService.class),
                mock(TableDataService.class),
                mock(AiSchemaContextService.class),
                mock(org.apache.datawise.backend.ai.schema.AiTableRelationService.class),
                mock(org.apache.datawise.backend.connector.facade.ConnectorFacade.class)
        );
        UserContext.set(9L, false, "session-1");

        service.proposeOpenConsole(Map.of(
                "connectionId", "conn-prod",
                "sql", "UPDATE users SET active = 0"
        ));

        ArgumentCaptor<String> riskCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Map<String, Object>> previewCaptor = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<Map<String, Object>> executionCaptor = ArgumentCaptor.forClass(Map.class);
        verify(confirmGate).propose(
                eq("propose_open_console"),
                riskCaptor.capture(),
                anyString(),
                previewCaptor.capture(),
                executionCaptor.capture()
        );
        assertEquals(ConfirmTicket.RISK_PROD_APPROVAL, riskCaptor.getValue());
        assertEquals(true, executionCaptor.getValue().get("requiresApproval"));
        Object review = previewCaptor.getValue().get("review");
        assertTrue(review instanceof Map);
        assertEquals(true, ((Map<?, ?>) review).get("requiresApproval"));
        assertEquals("PROD_APPROVAL", ((Map<?, ?>) review).get("code"));
        verify(permissions).requirePermission(UserFeaturePermission.WORKBENCH_TAB_NEW);
    }

    @Test
    void listSemanticMetricsRequiresAiPack() {
        AiAccessGate aiAccessGate = mock(AiAccessGate.class);
        SemanticMetricQuery semanticMetricQuery = mock(SemanticMetricQuery.class);
        doThrow(PackEntitlementException.licenseRequired("pack.ai"))
                .when(aiAccessGate).requireAiPack();
        McpBridgeService service = new McpBridgeService(
                mock(ConnectionVisibilityService.class),
                mock(TableDetailService.class),
                mock(SqlService.class),
                mock(SqlReviewOrchestrator.class),
                mock(SchemaDriftService.class),
                mock(AiTableTagFilter.class),
                semanticMetricQuery,
                mock(AnalysisCanvasRerun.class),
                mock(FederatedSqlGenerator.class),
                aiAccessGate,
                mock(TenantQuotaService.class),
                mock(WorkbenchContextStore.class),
                mock(ConfirmGateService.class),
                mock(FeaturePermissionAccess.class),
                mock(ProductionWriteGuardService.class),
                mock(McpAccessPolicyService.class),
                mock(McpCallAuditService.class),
                mock(TableDataService.class),
                mock(AiSchemaContextService.class),
                mock(org.apache.datawise.backend.ai.schema.AiTableRelationService.class),
                mock(org.apache.datawise.backend.connector.facade.ConnectorFacade.class)
        );
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.SQL));

        assertThrows(PackEntitlementException.class, () -> service.listSemanticMetrics("c1", "db"));
        verify(aiAccessGate).requireAiPack();
        verifyNoInteractions(semanticMetricQuery);
    }

    private static McpBridgeService newService(
            SqlService sqlService,
            AiAccessGate aiAccessGate,
            TenantQuotaService tenantQuotaService,
            FeaturePermissionAccess featurePermissionAccess
    ) {
        McpAccessPolicyService policyService = mock(McpAccessPolicyService.class);
        when(policyService.current()).thenReturn(McpAccessPolicy.permissive("default"));
        return new McpBridgeService(
                mock(ConnectionVisibilityService.class),
                mock(TableDetailService.class),
                sqlService,
                mock(SqlReviewOrchestrator.class),
                mock(SchemaDriftService.class),
                mock(AiTableTagFilter.class),
                mock(SemanticMetricQuery.class),
                mock(AnalysisCanvasRerun.class),
                mock(FederatedSqlGenerator.class),
                aiAccessGate,
                tenantQuotaService,
                mock(WorkbenchContextStore.class),
                mock(ConfirmGateService.class),
                featurePermissionAccess,
                mock(ProductionWriteGuardService.class),
                policyService,
                new McpCallAuditService(),
                mock(TableDataService.class),
                mock(AiSchemaContextService.class),
                mock(org.apache.datawise.backend.ai.schema.AiTableRelationService.class),
                mock(org.apache.datawise.backend.connector.facade.ConnectorFacade.class)
        );
    }

    @Test
    void invokeDeniesDangerousToolsUnderReadOnlyPolicy() {
        McpAccessPolicyStore policyStore = mock(McpAccessPolicyStore.class);
        when(policyStore.load(anyString())).thenReturn(Optional.of(McpAccessPolicy.readOnlyPolicy("default")));
        McpAccessPolicyService policyService = new McpAccessPolicyService(policyStore);
        McpBridgeService service = new McpBridgeService(
                mock(ConnectionVisibilityService.class),
                mock(TableDetailService.class),
                mock(SqlService.class),
                mock(SqlReviewOrchestrator.class),
                mock(SchemaDriftService.class),
                mock(AiTableTagFilter.class),
                mock(SemanticMetricQuery.class),
                mock(AnalysisCanvasRerun.class),
                mock(FederatedSqlGenerator.class),
                mock(AiAccessGate.class),
                mock(TenantQuotaService.class),
                mock(WorkbenchContextStore.class),
                mock(ConfirmGateService.class),
                mock(FeaturePermissionAccess.class),
                mock(ProductionWriteGuardService.class),
                policyService,
                new McpCallAuditService(),
                mock(TableDataService.class),
                mock(AiSchemaContextService.class),
                mock(org.apache.datawise.backend.ai.schema.AiTableRelationService.class),
                mock(org.apache.datawise.backend.connector.facade.ConnectorFacade.class)
        );
        UserContext.set(1L, false, "session-1");

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.invoke(new McpBridgeService.McpInvokeRequest(
                        "propose_open_console",
                        Map.of("sql", "select 1")
                ))
        );
        assertTrue(error.getMessage().toLowerCase().contains("read-only")
                || error.getMessage().toLowerCase().contains("dangerous"));
    }

    @Test
    void listToolsIncludesAnnotationsAndNewSchemaTools() {
        McpBridgeService service = newService(
                mock(SqlService.class),
                mock(AiAccessGate.class),
                mock(TenantQuotaService.class),
                mock(FeaturePermissionAccess.class)
        );
        var tools = service.listTools();
        assertTrue(tools.size() >= 21);
        assertTrue(tools.stream().anyMatch(t -> "get_sample_data".equals(t.get("name"))));
        assertTrue(tools.stream().anyMatch(t -> "explain_query".equals(t.get("name"))));
        assertTrue(tools.stream().anyMatch(t -> "validate_sql".equals(t.get("name"))));
        assertTrue(tools.stream().anyMatch(t -> "list_relations".equals(t.get("name"))));
        assertTrue(tools.stream().anyMatch(t -> "query_status".equals(t.get("name"))));
        assertTrue(tools.stream().anyMatch(t -> "cancel_query".equals(t.get("name"))));
        assertTrue(tools.stream().anyMatch(t -> "get_access_policy".equals(t.get("name"))));
        assertTrue(tools.stream().allMatch(t -> t.containsKey("readOnly") && t.containsKey("dangerous")));
    }
}
