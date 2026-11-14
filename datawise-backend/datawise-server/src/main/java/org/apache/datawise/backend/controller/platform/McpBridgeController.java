package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.SchemaDriftCompareRequest;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.platform.mcp.McpAccessPolicy;
import org.apache.datawise.backend.platform.mcp.McpAccessPolicyService;
import org.apache.datawise.backend.platform.mcp.McpAccessPolicyStore;
import org.apache.datawise.backend.platform.mcp.McpBridgeService;
import org.apache.datawise.backend.platform.mcp.audit.McpCallAuditEntry;
import org.apache.datawise.backend.platform.mcp.audit.McpCallAuditService;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

/**
 * REST bridge for the DataWise MCP server ({@code datawise-mcp/}).
 */
@RestController
@RequestMapping("/api/platform/mcp")
@Profile("!without-ai")
@RequiresFeature(UserFeaturePermission.NAV_AI)
public class McpBridgeController {

    private final McpBridgeService mcpBridgeService;
    private final McpAccessPolicyService accessPolicyService;
    private final McpCallAuditService callAuditService;

    public McpBridgeController(
            McpBridgeService mcpBridgeService,
            McpAccessPolicyService accessPolicyService,
            McpCallAuditService callAuditService
    ) {
        this.mcpBridgeService = mcpBridgeService;
        this.accessPolicyService = accessPolicyService;
        this.callAuditService = callAuditService;
    }

    @GetMapping("/tools")
    public ApiResponse<List<Map<String, Object>>> listTools() {
        return ApiResponse.ok(mcpBridgeService.listTools());
    }

    /**
     * Unified MCP tool entry. Class-level {@code NAV_AI} is enough here — per-tool
     * {@link org.apache.datawise.backend.platform.mcp.McpToolSpec#requiredFeature()} and
     * access policy run inside {@link McpBridgeService#invoke}. Do not gate this endpoint
     * on DANGEROUS_SQL: most tools are read-only and would be blocked incorrectly.
     */
    @PostMapping("/invoke")
    public ApiResponse<Object> invoke(@RequestBody McpBridgeService.McpInvokeRequest request) {
        return ApiResponse.ok(mcpBridgeService.invoke(request));
    }

    @GetMapping("/workbench-context")
    public ApiResponse<Object> getWorkbenchContext(
            @RequestParam(required = false, defaultValue = "true") boolean includeBodyPreview
    ) {
        return ApiResponse.ok(mcpBridgeService.getWorkbenchContext(
                Map.of("includeBodyPreview", includeBodyPreview)));
    }

    @GetMapping("/connections")
    public ApiResponse<List<Map<String, String>>> listConnections() {
        return ApiResponse.ok(mcpBridgeService.listConnections());
    }

    @GetMapping("/schema/tables")
    public ApiResponse<List<String>> listTables(
            @RequestParam String connectionId,
            @RequestParam String database
    ) {
        return ApiResponse.ok(mcpBridgeService.listTables(connectionId, database));
    }

    @PostMapping("/sql/review")
    public ApiResponse<Object> reviewSql(@RequestBody SqlReviewRequest request) {
        return ApiResponse.ok(mcpBridgeService.reviewSql(request));
    }

    @PostMapping("/sql/execute-readonly")
    public ApiResponse<Object> executeReadonly(@RequestBody ExecuteSqlRequest request) {
        return ApiResponse.ok(mcpBridgeService.executeReadonly(request));
    }

    @PostMapping("/schema-drift/compare")
    public ApiResponse<Object> compareSchema(@RequestBody SchemaDriftCompareRequest request) {
        return ApiResponse.ok(mcpBridgeService.compareSchema(request));
    }

    @GetMapping("/semantic-metrics")
    public ApiResponse<Object> listSemanticMetrics(
            @RequestParam String connectionId,
            @RequestParam String database
    ) {
        return ApiResponse.ok(mcpBridgeService.listSemanticMetrics(connectionId, database));
    }

    @PostMapping("/canvas/rerun")
    public ApiResponse<Object> rerunCanvas(@RequestBody Map<String, Object> body) {
        String canvasId = body.get("canvasId") != null ? String.valueOf(body.get("canvasId")) : null;
        Object parameterValues = body.get("parameterValues");
        return ApiResponse.ok(mcpBridgeService.rerunCanvas(canvasId, parameterValues));
    }

    @GetMapping("/access-policy")
    @RequiresFeature(UserFeaturePermission.SETTINGS_AI)
    public ApiResponse<Map<String, Object>> getAccessPolicy() {
        return ApiResponse.ok(accessPolicyService.currentAsMap());
    }

    @PutMapping("/access-policy")
    @RequiresFeature(UserFeaturePermission.SETTINGS_AI)
    public ApiResponse<Map<String, Object>> putAccessPolicy(@RequestBody Map<String, Object> body) {
        String tenantId = UserContext.requireTenantId();
        McpAccessPolicy policy = McpAccessPolicyStore.fromMap(tenantId, body);
        accessPolicyService.put(tenantId, policy);
        return ApiResponse.ok(accessPolicyService.currentAsMap());
    }

    @GetMapping("/call-audit")
    @RequiresFeature(UserFeaturePermission.SETTINGS_AI)
    public ApiResponse<List<McpCallAuditEntry>> listCallAudit(
            @RequestParam(required = false, defaultValue = "50") int limit
    ) {
        return ApiResponse.ok(callAuditService.listRecent(limit));
    }
}
