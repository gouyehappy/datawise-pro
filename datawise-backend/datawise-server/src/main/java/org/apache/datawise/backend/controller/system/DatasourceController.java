package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.ConnectorExplorerUiCatalogDto;
import org.apache.datawise.backend.domain.ConnectorMarketEntryDto;
import org.apache.datawise.backend.domain.ConnectorPluginLoadStatusDto;
import org.apache.datawise.backend.domain.ConnectorPluginReloadResultDto;
import org.apache.datawise.backend.domain.InstallConnectorBatchRequest;
import org.apache.datawise.backend.domain.InstallConnectorBatchResultDto;
import org.apache.datawise.backend.domain.InstallConnectorPluginRequest;
import org.apache.datawise.backend.domain.InstallConnectorPluginResultDto;
import org.apache.datawise.backend.domain.JdbcDriverCatalogDto;
import org.apache.datawise.backend.domain.JdbcDriverResolveRequest;
import org.apache.datawise.backend.domain.JdbcDriverResolveResult;
import org.apache.datawise.backend.domain.RuntimeOfflineImportRequest;
import org.apache.datawise.backend.domain.RuntimeOfflineImportResultDto;
import org.apache.datawise.backend.domain.UninstallConnectorPluginResultDto;
import org.apache.datawise.backend.domain.pack.PackConnectorMap;
import org.apache.datawise.backend.database.connection.DatasourceCatalogService;
import org.apache.datawise.backend.database.connection.JdbcDriverService;
import org.apache.datawise.backend.security.HeadlessRuntimeAuth;
import org.apache.datawise.backend.server.pack.EntitlementService;
import org.apache.datawise.backend.server.runtime.RuntimeOfflineImportService;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/datasources")
public class DatasourceController {

    private final DatasourceCatalogService datasourceCatalogService;
    private final JdbcDriverService jdbcDriverService;
    private final RuntimeOfflineImportService runtimeOfflineImportService;
    private final UserAdminPolicy userAdminPolicy;
    private final EntitlementService entitlementService;

    public DatasourceController(
            DatasourceCatalogService datasourceCatalogService,
            JdbcDriverService jdbcDriverService,
            RuntimeOfflineImportService runtimeOfflineImportService,
            UserAdminPolicy userAdminPolicy,
            EntitlementService entitlementService
    ) {
        this.datasourceCatalogService = datasourceCatalogService;
        this.jdbcDriverService = jdbcDriverService;
        this.runtimeOfflineImportService = runtimeOfflineImportService;
        this.userAdminPolicy = userAdminPolicy;
        this.entitlementService = entitlementService;
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> listDatasources() {
        return ApiResponse.ok(Map.of(
                "datasources", datasourceCatalogService.listAvailable(),
                "loadedPluginJars", datasourceCatalogService.loadedPluginJarNames(),
                "pluginLoadFailures", datasourceCatalogService.pluginLoadFailures()
        ));
    }

    @GetMapping("/market")
    public ApiResponse<Map<String, Object>> listConnectorMarket() {
        var manifest = datasourceCatalogService.pluginManifest().orElse(null);
        List<ConnectorMarketEntryDto> connectors = datasourceCatalogService.listMarket().stream()
                .map(this::enrichMarketEntry)
                .toList();
        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("connectors", connectors);
        payload.put("loadedPluginJars", datasourceCatalogService.loadedPluginJarNames());
        payload.put("pluginLoadFailures", datasourceCatalogService.pluginLoadFailures());
        if (manifest != null) {
            payload.put("manifest", Map.of(
                    "schemaVersion", manifest.schemaVersion(),
                    "updatedAt", manifest.updatedAt() != null ? manifest.updatedAt() : "",
                    "channel", manifest.channel() != null ? manifest.channel() : "",
                    "pluginCount", manifest.plugins().size()
            ));
        }
        return ApiResponse.ok(payload);
    }

    @GetMapping("/explorer-ui")
    public ApiResponse<ConnectorExplorerUiCatalogDto> listExplorerUiCatalog() {
        return ApiResponse.ok(datasourceCatalogService.listExplorerUiCatalog());
    }

    private ConnectorMarketEntryDto enrichMarketEntry(ConnectorMarketEntryDto entry) {
        var packId = PackConnectorMap.packIdForConnector(entry.id());
        if (packId.isEmpty()) {
            return entry.withEntitlement(null, false);
        }
        boolean locked = !entitlementService.isPackUsable(packId.get());
        return entry.withEntitlement(packId.get(), locked);
    }

    @PostMapping("/market/install")
    public ApiResponse<InstallConnectorPluginResultDto> installConnectorPlugin(
            @RequestBody InstallConnectorPluginRequest request
    ) {
        HeadlessRuntimeAuth.requireRuntimeManageAccess(userAdminPolicy);
        String connectorId = request != null ? request.connectorId() : null;
        entitlementService.requireConnector(connectorId);
        return ApiResponse.ok(datasourceCatalogService.installRemotePlugin(connectorId));
    }

    @PostMapping("/market/install-batch")
    public ApiResponse<InstallConnectorBatchResultDto> installConnectorPluginsBatch(
            @RequestBody InstallConnectorBatchRequest request
    ) {
        HeadlessRuntimeAuth.requireRuntimeManageAccess(userAdminPolicy);
        if (request != null && request.connectorIds() != null) {
            for (String connectorId : request.connectorIds()) {
                entitlementService.requireConnector(connectorId);
            }
        }
        return ApiResponse.ok(datasourceCatalogService.installRemotePluginsBatch(
                request != null ? request.connectorIds() : null
        ));
    }

    @DeleteMapping("/market/{connectorId}")
    public ApiResponse<UninstallConnectorPluginResultDto> uninstallConnectorPlugin(
            @PathVariable String connectorId
    ) {
        HeadlessRuntimeAuth.requireRuntimeManageAccess(userAdminPolicy);
        return ApiResponse.ok(datasourceCatalogService.uninstallPlugin(connectorId));
    }

    /** Deletes plugin JARs on disk that are not currently loaded (classpath-shadowed leftovers). */
    @PostMapping("/market/cleanup-redundant")
    public ApiResponse<org.apache.datawise.backend.domain.CleanupConnectorPluginsResultDto> cleanupRedundantPlugins() {
        HeadlessRuntimeAuth.requireRuntimeManageAccess(userAdminPolicy);
        return ApiResponse.ok(datasourceCatalogService.cleanupRedundantPluginJars());
    }

    /**
     * Alias of {@code POST /api/runtime/import}: admin or runtime-scoped API token;
     * offline zip import from a local filesystem path.
     */
    @PostMapping("/market/import-offline")
    public ApiResponse<RuntimeOfflineImportResultDto> importOfflineMarketZip(
            @RequestBody RuntimeOfflineImportRequest request
    ) {
        HeadlessRuntimeAuth.requireRuntimeManageAccess(userAdminPolicy);
        String path = request != null ? request.path() : null;
        return ApiResponse.ok(runtimeOfflineImportService.importFromPath(path));
    }

    /** Boot-time deferred plugin scan status (classpath registry is available before READY). */
    @GetMapping("/plugins/status")
    public ApiResponse<ConnectorPluginLoadStatusDto> connectorPluginLoadStatus() {
        return ApiResponse.ok(datasourceCatalogService.pluginLoadStatus());
    }

    /** Hot-reload connector JARs from {@code config/plugins} without restarting the process. */
    @PostMapping("/plugins/reload")
    public ApiResponse<ConnectorPluginReloadResultDto> reloadConnectorPlugins() {
        HeadlessRuntimeAuth.requireRuntimeManageAccess(userAdminPolicy);
        return ApiResponse.ok(datasourceCatalogService.reloadPlugins());
    }

    /** Delete integrity-rejected JARs under {@code config/plugins/.quarantine/} and reload. */
    @PostMapping("/plugins/quarantine/clear")
    public ApiResponse<ConnectorPluginReloadResultDto> clearQuarantinedConnectorPlugins()
            throws java.io.IOException {
        HeadlessRuntimeAuth.requireRuntimeManageAccess(userAdminPolicy);
        return ApiResponse.ok(datasourceCatalogService.clearQuarantinedPlugins());
    }

    @GetMapping("/drivers")
    public ApiResponse<JdbcDriverCatalogDto> listDrivers() {
        return ApiResponse.ok(jdbcDriverService.listCached());
    }

    @GetMapping("/drivers/progress")
    public ApiResponse<org.apache.datawise.backend.domain.JdbcDriverDownloadProgressDto> driverDownloadProgress(
            @RequestParam("maven") String maven
    ) {
        return ApiResponse.ok(jdbcDriverService.downloadProgress(maven));
    }

    @PostMapping("/drivers/install")
    public ApiResponse<JdbcDriverResolveResult> installDriver(@RequestBody JdbcDriverResolveRequest request)
            throws SQLException {
        return ApiResponse.ok(jdbcDriverService.install(request));
    }

    @PostMapping("/drivers/resolve")
    public ApiResponse<JdbcDriverResolveResult> resolveDriver(@RequestBody JdbcDriverResolveRequest request)
            throws SQLException {
        return ApiResponse.ok(jdbcDriverService.resolve(request));
    }

    @DeleteMapping("/drivers")
    public ApiResponse<Map<String, Object>> deleteDriver(@RequestParam("path") String relativePath) {
        userAdminPolicy.requireAdminUser();
        String path = relativePath == null ? "" : relativePath;
        boolean deleted = jdbcDriverService.deleteCached(path);
        return ApiResponse.ok(Map.of(
                "deleted", deleted,
                "relativePath", path
        ));
    }

    @DeleteMapping("/drivers/bundles/{bundleDir}")
    public ApiResponse<Map<String, Object>> deleteDriverBundle(@PathVariable String bundleDir) {
        userAdminPolicy.requireAdminUser();
        int deleted = jdbcDriverService.deleteBundle(bundleDir);
        return ApiResponse.ok(Map.of(
                "deletedCount", deleted,
                "bundleDir", bundleDir == null ? "" : bundleDir
        ));
    }

    @DeleteMapping("/drivers/families/{familyId}")
    public ApiResponse<Map<String, Object>> deleteDriverFamily(@PathVariable String familyId) {
        userAdminPolicy.requireAdminUser();
        int deleted = jdbcDriverService.deleteFamily(familyId);
        return ApiResponse.ok(Map.of(
                "deletedCount", deleted,
                "familyId", familyId == null ? "" : familyId
        ));
    }
}
