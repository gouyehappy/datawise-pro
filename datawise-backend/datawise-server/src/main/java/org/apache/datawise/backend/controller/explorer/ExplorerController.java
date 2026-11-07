package org.apache.datawise.backend.controller.explorer;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.support.PerfLogger;
import org.apache.datawise.backend.database.explorer.CreateNamespaceService;
import org.apache.datawise.backend.database.explorer.ExplorerChildLoadOutcome;
import org.apache.datawise.backend.database.explorer.ExplorerConnectionAdminService;
import org.apache.datawise.backend.database.explorer.ExplorerConnectionLifecycleService;
import org.apache.datawise.backend.database.explorer.ExplorerLoadMetrics;
import org.apache.datawise.backend.database.explorer.ExplorerLoadOptions;
import org.apache.datawise.backend.database.explorer.ExplorerSchemaService;
import org.apache.datawise.backend.database.explorer.ExplorerTreeEtag;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.ConnectionResult;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.CreateConnectionRequest;
import org.apache.datawise.backend.domain.CreateDatabaseRequest;
import org.apache.datawise.backend.domain.CreateNamespaceResult;
import org.apache.datawise.backend.domain.CreateSchemaRequest;
import org.apache.datawise.backend.domain.GroupResult;
import org.apache.datawise.backend.domain.ImportConnectionsRequest;
import org.apache.datawise.backend.domain.ImportConnectionsResult;
import org.apache.datawise.backend.domain.MysqlCharsetOptionsResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.domain.TreePayload;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.apache.datawise.backend.server.pack.EntitlementService;
import org.apache.datawise.backend.service.FeaturePermissionAccess;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/explorer")
public class ExplorerController
{

    private static final Logger log = LoggerFactory.getLogger(ExplorerController.class);

    private final ExplorerSchemaService schemaService;
    private final ExplorerLoadMetrics explorerLoadMetrics;
    private final ExplorerConnectionAdminService connectionAdminService;
    private final ExplorerConnectionLifecycleService connectionLifecycleService;
    private final CreateNamespaceService createNamespaceService;
    private final FeaturePermissionAccess featurePermissionAccess;
    private final EntitlementService entitlementService;

    public ExplorerController(
            ExplorerSchemaService schemaService,
            ExplorerLoadMetrics explorerLoadMetrics,
            ExplorerConnectionAdminService connectionAdminService,
            ExplorerConnectionLifecycleService connectionLifecycleService,
            CreateNamespaceService createNamespaceService,
            FeaturePermissionAccess featurePermissionAccess,
            EntitlementService entitlementService
    )
    {
        this.schemaService = schemaService;
        this.explorerLoadMetrics = explorerLoadMetrics;
        this.connectionAdminService = connectionAdminService;
        this.connectionLifecycleService = connectionLifecycleService;
        this.createNamespaceService = createNamespaceService;
        this.featurePermissionAccess = featurePermissionAccess;
        this.entitlementService = entitlementService;
    }

    @GetMapping("/tree")
    public ApiResponse<TreePayload> fetchTree(@RequestParam(required = false) Boolean refresh)
    {
        List<TreeNode> tree = schemaService.fetchTree(Boolean.TRUE.equals(refresh));
        return ApiResponse.ok(new TreePayload(tree));
    }

    @GetMapping("/connections/{connectionId}")
    public ApiResponse<ConnectionConfig> fetchConnection(@PathVariable String connectionId)
    {
        return ApiResponse.ok(schemaService.getConnection(connectionId));
    }

    @PostMapping("/connections/{connectionId}/connect")
    public ApiResponse<ConnectionTestResult> connectConnection(@PathVariable String connectionId)
    {
        featurePermissionAccess.requireExplorerContextConnection();
        requireConnectorForStoredConnection(connectionId);
        return ApiResponse.ok(connectionLifecycleService.connect(connectionId));
    }

    @GetMapping("/connections/{connectionId}/ping")
    public ApiResponse<ConnectionTestResult> pingConnection(@PathVariable String connectionId)
    {
        return ApiResponse.ok(connectionLifecycleService.ping(connectionId));
    }

    /** 仅刷新已建池连接的活跃时间；未连接时返回 false，不自动 connect。 */
    @PostMapping("/connections/{connectionId}/touch")
    public ApiResponse<Boolean> touchConnection(@PathVariable String connectionId)
    {
        return ApiResponse.ok(connectionLifecycleService.touchIfPooled(connectionId));
    }

    @PostMapping("/connections/{connectionId}/disconnect")
    public ApiResponse<Void> disconnectConnection(@PathVariable String connectionId)
    {
        featurePermissionAccess.requireExplorerContextConnection();
        connectionLifecycleService.disconnect(connectionId);
        return ApiResponse.ok(null);
    }

    @GetMapping("/connections/pooled")
    public ApiResponse<List<String>> listPooledConnections()
    {
        return ApiResponse.ok(connectionLifecycleService.listPooledConnectionIds());
    }

    @PostMapping("/connections/{connectionId}/reconnect")
    public ApiResponse<ConnectionTestResult> reconnectConnection(@PathVariable String connectionId)
    {
        featurePermissionAccess.requireExplorerContextConnection();
        requireConnectorForStoredConnection(connectionId);
        return ApiResponse.ok(connectionLifecycleService.reconnect(connectionId));
    }

    @GetMapping("/connections/{connectionId}/nodes/{nodeId}/children")
    public ResponseEntity<ApiResponse<TreePayload>> loadChildren(
            @PathVariable String connectionId,
            @PathVariable String nodeId,
            @RequestParam(required = false) String pattern,
            @RequestParam(required = false, defaultValue = "false") boolean refresh,
            @RequestParam(required = false) Integer offset,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false, defaultValue = "true") boolean skeleton,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch
    )
    {
        long startedAt = System.currentTimeMillis();
        ExplorerLoadOptions options = ExplorerLoadOptions.of(pattern, refresh, offset, limit, skeleton);
        ExplorerChildLoadOutcome outcome = schemaService.loadChildrenWithCaching(
                connectionId,
                nodeId,
                options,
                ifNoneMatch
        );
        explorerLoadMetrics.record(outcome);
        if (outcome.notModified()) {
            return ResponseEntity.status(304)
                    .eTag(ExplorerTreeEtag.stripQuotes(outcome.etag()))
                    .build();
        }
        PerfLogger.log(
                log,
                "explorer.loadChildren",
                startedAt,
                "connectionId", connectionId,
                "nodeId", nodeId,
                "etag", ExplorerTreeEtag.stripQuotes(outcome.etag()),
                "fromCache", false,
                "shortCircuit", false
        );
        return ResponseEntity.ok()
                .eTag(ExplorerTreeEtag.stripQuotes(outcome.etag()))
                .body(ApiResponse.ok(outcome.result().payload()));
    }


    @PostMapping("/groups")
    public ApiResponse<GroupResult> createGroup(@RequestBody Map<String, String> body)
    {
        featurePermissionAccess.requireExplorerCatalogMutation();
        String label = body.getOrDefault("label", "New group");
        String parentId = body.get("parentId");
        return ApiResponse.ok(connectionAdminService.createGroup(label, parentId));
    }

    @PutMapping("/groups/{groupId}")
    public ApiResponse<TreePayload> updateGroup(
            @PathVariable String groupId,
            @RequestBody Map<String, String> body
    )
    {
        featurePermissionAccess.requireExplorerCatalogMutation();
        String label = body.getOrDefault("label", "");
        return ApiResponse.ok(new TreePayload(connectionAdminService.updateGroup(groupId, label)));
    }

    @PostMapping("/connections/{connectionId}/databases")
    public ApiResponse<CreateNamespaceResult> createDatabase(
            @PathVariable String connectionId,
            @RequestBody CreateDatabaseRequest request
    )
    {
        HeadlessSqlAuth.requireSqlAccess();
        featurePermissionAccess.requireExplorerContextDangerous();
        return ApiResponse.ok(createNamespaceService.createDatabase(connectionId, request));
    }

    @DeleteMapping("/connections/{connectionId}/databases/{name}")
    public ApiResponse<CreateNamespaceResult> deleteDatabase(
            @PathVariable String connectionId,
            @PathVariable String name
    )
    {
        HeadlessSqlAuth.requireSqlAccess();
        featurePermissionAccess.requireExplorerContextDangerous();
        return ApiResponse.ok(createNamespaceService.deleteDatabase(connectionId, name));
    }

    @PostMapping("/connections/{connectionId}/schemas")
    public ApiResponse<CreateNamespaceResult> createSchema(
            @PathVariable String connectionId,
            @RequestBody CreateSchemaRequest request
    )
    {
        HeadlessSqlAuth.requireSqlAccess();
        featurePermissionAccess.requireExplorerContextDangerous();
        return ApiResponse.ok(createNamespaceService.createSchema(connectionId, request));
    }

    @GetMapping("/connections/{connectionId}/mysql/charsets")
    public ApiResponse<MysqlCharsetOptionsResult> listMysqlCharsets(@PathVariable String connectionId)
    {
        HeadlessSqlAuth.requireSqlAccess();
        return ApiResponse.ok(createNamespaceService.listMysqlCharsetOptions(connectionId));
    }

    @PostMapping("/connections")
    public ApiResponse<ConnectionResult> createConnection(@RequestBody CreateConnectionRequest request)
    {
        featurePermissionAccess.requireExplorerCatalogMutation();
        requireConnectorForConfig(request != null ? request.config() : null);
        return ApiResponse.ok(connectionAdminService.createConnection(request.config(), request.groupId()));
    }

    @PutMapping("/connections/{connectionId}")
    public ApiResponse<TreePayload> updateConnection(
            @PathVariable String connectionId,
            @RequestBody ConnectionConfig config
    )
    {
        featurePermissionAccess.requireExplorerCatalogMutation();
        requireConnectorForConfig(config);
        return ApiResponse.ok(new TreePayload(connectionAdminService.updateConnection(connectionId, config)));
    }

    @PutMapping("/connections/{connectionId}/group")
    public ApiResponse<TreePayload> moveConnection(
            @PathVariable String connectionId,
            @RequestBody Map<String, String> body
    )
    {
        featurePermissionAccess.requireExplorerCatalogMutation();
        String groupId = body.get("groupId");
        if (groupId == null || groupId.isBlank()) {
            throw new IllegalArgumentException("groupId is required");
        }
        return ApiResponse.ok(new TreePayload(connectionAdminService.moveConnection(connectionId, groupId)));
    }

    @PutMapping("/reorder")
    public ApiResponse<TreePayload> reorder(@RequestBody Map<String, String> body)
    {
        featurePermissionAccess.requireExplorerCatalogMutation();
        String nodeId = body.get("nodeId");
        String targetId = body.get("targetId");
        String position = body.get("position");
        if (nodeId == null || nodeId.isBlank() || targetId == null || targetId.isBlank()) {
            throw new IllegalArgumentException("nodeId and targetId are required");
        }
        if (position == null || position.isBlank()) {
            throw new IllegalArgumentException("position is required");
        }
        return ApiResponse.ok(new TreePayload(connectionAdminService.reorder(nodeId, targetId, position)));
    }

    @DeleteMapping("/nodes/{nodeId}")
    public ApiResponse<TreePayload> deleteNode(@PathVariable String nodeId)
    {
        featurePermissionAccess.requireExplorerNodeDelete(connectionAdminService.isCatalogStructureNode(nodeId));
        return ApiResponse.ok(new TreePayload(connectionAdminService.deleteNode(nodeId)));
    }

    @PostMapping("/connections/import")
    public ApiResponse<ImportConnectionsResult> importConnections(@RequestBody ImportConnectionsRequest request)
    {
        featurePermissionAccess.requireExplorerContextExport();
        if (request != null && request.configs() != null) {
            for (ConnectionConfig config : request.configs()) {
                requireConnectorForConfig(config);
            }
        }
        return ApiResponse.ok(connectionAdminService.importConnections(request.configs()));
    }

    private void requireConnectorForStoredConnection(String connectionId)
    {
        ConnectionConfig config = schemaService.getConnection(connectionId);
        requireConnectorForConfig(config);
    }

    private void requireConnectorForConfig(ConnectionConfig config)
    {
        if (config == null) {
            return;
        }
        // Community plugin connections are gated by installed .dwp packages, not JDBC connectors.
        if (config.getDbType() != null && "plugin".equalsIgnoreCase(config.getDbType().trim())) {
            return;
        }
        entitlementService.requireConnector(config.getDbType());
    }
}
