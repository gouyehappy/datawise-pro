package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.common.DatasourceNotAvailableException;
import org.apache.datawise.backend.common.DatasourceTypeRequiredException;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.DbTypeCatalogEntry;
import org.apache.datawise.backend.config.ConnectorDownloadProperties;
import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginJarLocator;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginManifestSupport;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginsBootstrappedEvent;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityCatalog;
import org.apache.datawise.backend.connector.plugin.ConnectorPluginRemoteInstallSupport;
import org.apache.datawise.backend.domain.CleanupConnectorPluginsResultDto;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiCatalogDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;
import org.apache.datawise.backend.domain.ConnectorMarketEntryDto;
import org.apache.datawise.backend.domain.ConnectorPluginIntegrityStatus;
import org.apache.datawise.backend.domain.ConnectorPluginLoadFailure;
import org.apache.datawise.backend.domain.ConnectorPluginLoadStatusDto;
import org.apache.datawise.backend.domain.ConnectorPluginManifest;
import org.apache.datawise.backend.domain.ConnectorPluginManifestEntry;
import org.apache.datawise.backend.domain.DatasourceDefinitionDto;
import org.apache.datawise.backend.domain.ConnectorPluginReloadResultDto;
import org.apache.datawise.backend.domain.InstallConnectorBatchResultDto;
import org.apache.datawise.backend.domain.InstallConnectorPluginResultDto;
import org.apache.datawise.backend.domain.UninstallConnectorPluginResultDto;
import org.apache.datawise.backend.ops.DatabaseOpsRegistry;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class DatasourceCatalogService {

    private final ConnectorFacade connectorFacade;
    private final DatabaseOpsRegistry opsRegistry;
    private final ConnectorDownloadProperties downloadProperties;
    private volatile CatalogSnapshot snapshot;

    public DatasourceCatalogService(
            ConnectorFacade connectorFacade,
            DatabaseOpsRegistry opsRegistry,
            ConnectorDownloadProperties downloadProperties
    ) {
        this.connectorFacade = connectorFacade;
        this.opsRegistry = opsRegistry;
        this.downloadProperties = downloadProperties;
    }

    /** Lists catalog-visible datasource types that have a loaded connector plugin. */
    public List<DatasourceDefinitionDto> listAvailable() {
        return snapshot().available();
    }

    /** Full connector market: every catalog-listed type with runtime availability. */
    public List<ConnectorMarketEntryDto> listMarket() {
        CatalogSnapshot snap = snapshot();
        Optional<ConnectorPluginManifest> manifest = connectorFacade.catalog().pluginManifest();
        Map<String, String> jarByConnector = connectorFacade.catalog().loadedJarByConnectorId();
        Path pluginsDir = connectorFacade.catalog().pluginsDirectory();
        List<ConnectorMarketEntryDto> market = new ArrayList<>();
        for (DbType type : DbType.catalogListed()) {
            DbTypeCatalogEntry catalog = type.catalogEntry().orElseThrow();
            DatasourceDefinitionDto available = snap.byId().get(type.id());
            Optional<ConnectorPluginManifestEntry> manifestEntry = manifest.flatMap(
                    value -> ConnectorPluginManifestSupport.findById(value, type.id())
            );
            String loadedJar = jarByConnector.get(type.id());
            boolean fromPluginJar = loadedJar != null;
            String diskJar = ConnectorPluginJarLocator.findJarName(pluginsDir, type.id()).orElse(null);
            String jarName = loadedJar != null
                    ? loadedJar
                    : (diskJar != null
                    ? diskJar
                    : manifestEntry.map(ConnectorPluginManifestEntry::jar).orElse(null));
            boolean redundantOnDisk = available != null && !fromPluginJar && diskJar != null;
            if (available != null) {
                String integrity = ConnectorPluginManifestSupport.resolveIntegrityStatus(
                        true,
                        fromPluginJar,
                        manifestEntry,
                        pluginsDir,
                        loadedJar
                );
                market.add(new ConnectorMarketEntryDto(
                        available.id(),
                        available.label(),
                        available.primary(),
                        true,
                        available.capabilities(),
                        null,
                        manifestEntry.map(ConnectorPluginManifestEntry::version).orElse(null),
                        jarName,
                        integrity,
                        manifestEntry.map(ConnectorPluginManifestEntry::downloadUrl).orElse(null),
                        redundantOnDisk
                ));
                continue;
            }
            String integrity = ConnectorPluginManifestSupport.resolveIntegrityStatus(
                    false,
                    false,
                    manifestEntry,
                    pluginsDir,
                    null
            );
            String hint = manifestEntry
                    .map(entry -> buildInstallHint(entry))
                    .orElse("Install connector plugin JAR under config/plugins, then Reload plugins (or restart).");
            market.add(new ConnectorMarketEntryDto(
                    type.id(),
                    type.getDisplayName(),
                    catalog.primary(),
                    false,
                    List.of(),
                    hint,
                    manifestEntry.map(ConnectorPluginManifestEntry::version).orElse(null),
                    jarName,
                    integrity,
                    manifestEntry.map(ConnectorPluginManifestEntry::downloadUrl).orElse(null),
                    false
            ));
        }
        return List.copyOf(market);
    }

    /**
     * Aggregates explorer UI profiles from loaded connectors.
     * Same dbType keeps the highest-priority (lowest priority number) contributor.
     */
    public ConnectorExplorerUiCatalogDto listExplorerUiCatalog() {
        Map<String, DataSourceConnector> winners = new LinkedHashMap<>();
        for (DataSourceConnector connector : connectorFacade.catalog().all()) {
            if (connector == null) {
                continue;
            }
            ConnectorExplorerUiProfileDto profile = connector.explorerUi();
            if (profile == null || profile.dbType() == null || profile.dbType().isBlank()) {
                continue;
            }
            String dbType = profile.dbType().trim().toLowerCase(Locale.ROOT);
            DataSourceConnector existing = winners.get(dbType);
            if (existing == null || connector.priority() < existing.priority()) {
                winners.put(dbType, connector);
            }
        }
        List<ConnectorExplorerUiProfileDto> profiles = new ArrayList<>();
        for (Map.Entry<String, DataSourceConnector> entry : winners.entrySet()) {
            ConnectorExplorerUiProfileDto raw = entry.getValue().explorerUi();
            if (raw == null) {
                continue;
            }
            List<ConnectorExplorerFeatureDto> features = raw.features() == null
                    ? List.of()
                    : raw.features().stream()
                    .sorted(Comparator.comparingInt(ConnectorExplorerFeatureDto::order))
                    .toList();
            profiles.add(new ConnectorExplorerUiProfileDto(entry.getKey(), List.copyOf(features)));
        }
        profiles.sort(Comparator.comparing(ConnectorExplorerUiProfileDto::dbType));
        return new ConnectorExplorerUiCatalogDto(List.copyOf(profiles));
    }

    public Optional<ConnectorPluginManifest> pluginManifest() {
        return connectorFacade.catalog().reloadPluginManifest();
    }

    /**
     * Downloads a marketplace connector JAR from its manifest {@code downloadUrl} into {@code config/plugins},
     * then hot-reloads plugins so the connector becomes available without a process restart when possible.
     */
    public InstallConnectorPluginResultDto installRemotePlugin(String connectorId) {
        InstallConnectorPluginResultDto downloaded = downloadRemotePlugin(connectorId);
        ConnectorPluginReloadResultDto reload = reloadPlugins();
        boolean available = findById(downloaded.connectorId()).isPresent();
        boolean restartRequired = !available || downloaded.restartRequired();
        String message = available
                ? "Plugin JAR installed and loaded (hot-reload). Connector is available now."
                : "Plugin JAR installed under config/plugins, but hot-reload did not activate it"
                + " (jar lock or load failure). Restart the backend. Failures: "
                + reload.failures();
        return new InstallConnectorPluginResultDto(
                downloaded.connectorId(),
                downloaded.jarName(),
                downloaded.integrityStatus(),
                restartRequired,
                message
        );
    }

    /**
     * Downloads multiple marketplace connectors, then performs a single hot-reload.
     */
    public InstallConnectorBatchResultDto installRemotePluginsBatch(List<String> connectorIds) {
        if (connectorIds == null || connectorIds.isEmpty()) {
            throw new IllegalArgumentException("connectorIds is required");
        }
        List<InstallConnectorPluginResultDto> results = new ArrayList<>();
        for (String connectorId : connectorIds) {
            if (connectorId == null || connectorId.isBlank()) {
                continue;
            }
            try {
                results.add(downloadRemotePlugin(connectorId.trim()));
            } catch (RuntimeException ex) {
                results.add(new InstallConnectorPluginResultDto(
                        connectorId.trim(),
                        null,
                        ConnectorPluginIntegrityStatus.MISSING,
                        false,
                        ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName()
                ));
            }
        }
        ConnectorPluginReloadResultDto reload = reloadPlugins();
        List<InstallConnectorPluginResultDto> finalized = new ArrayList<>();
        for (InstallConnectorPluginResultDto result : results) {
            if (result.jarName() == null) {
                finalized.add(result);
                continue;
            }
            boolean available = findById(result.connectorId()).isPresent();
            finalized.add(new InstallConnectorPluginResultDto(
                    result.connectorId(),
                    result.jarName(),
                    result.integrityStatus(),
                    !available,
                    available
                            ? "Plugin JAR installed and loaded (hot-reload). Connector is available now."
                            : "Plugin JAR installed; hot-reload did not activate it. Restart may be required. "
                            + reload.failures()
            ));
        }
        return new InstallConnectorBatchResultDto(List.copyOf(finalized), reload);
    }

    /**
     * Unloads plugins, deletes the connector JAR, then reloads remaining plugins.
     * Also works for redundant on-disk JARs that never became the live plugin source.
     */
    public UninstallConnectorPluginResultDto uninstallPlugin(String connectorId) {
        if (connectorId == null || connectorId.isBlank()) {
            throw new IllegalArgumentException("connectorId is required");
        }
        String id = connectorId.trim();
        String jarName = resolveInstalledJarName(id).orElse(null);
        Path pluginsDir = connectorFacade.catalog().pluginsDirectory();
        if (jarName == null || jarName.isBlank()) {
            throw new IllegalArgumentException(
                    "No removable plugin JAR for connector: " + id
                            + " (classpath/bundled connectors cannot be uninstalled from the marketplace)"
            );
        }
        Path target = pluginsDir.resolve(jarName).normalize();
        if (!target.startsWith(pluginsDir.normalize()) || !Files.isRegularFile(target)) {
            throw new IllegalArgumentException(
                    "Plugin JAR not on disk for connector: " + id
                            + " (" + jarName + "). Nothing to uninstall — use Reload if the catalog is stale."
            );
        }
        boolean wasLoaded = connectorFacade.catalog().loadedJarByConnectorId().containsKey(id);
        connectorFacade.catalog().unloadPlugins();
        boolean deleted;
        try {
            deleted = connectorFacade.catalog().deletePluginJar(target);
            // Same connector may leave multiple versioned JARs on disk — remove siblings too.
            for (String sibling : ConnectorPluginJarLocator.listJarNamesForConnector(pluginsDir, id)) {
                if (sibling.equals(jarName)) {
                    continue;
                }
                try {
                    connectorFacade.catalog().deletePluginJar(pluginsDir.resolve(sibling));
                } catch (IOException ignored) {
                    // best-effort
                }
            }
        } catch (IOException ex) {
            reloadPlugins();
            return new UninstallConnectorPluginResultDto(
                    id,
                    jarName,
                    false,
                    true,
                    "Failed to delete plugin JAR (file lock?). Restart the backend and retry: "
                            + target + " — " + ex.getMessage()
            );
        }
        ConnectorPluginReloadResultDto reload = reloadPlugins();
        boolean stillAvailable = findById(id).isPresent();
        Path pendingPath = target.resolveSibling(jarName + ".pending-delete");
        boolean pendingDelete = Files.isRegularFile(pendingPath);
        String message;
        if (pendingDelete) {
            message = "Plugin marked for deletion (file was locked). It will be removed on the next reload/restart.";
        } else if (!deleted) {
            message = "Plugin JAR was already missing; registry reloaded.";
        } else if (!wasLoaded && stillAvailable) {
            message = "Removed redundant plugin JAR from config/plugins. "
                    + "Connector remains available from the application classpath.";
        } else if (stillAvailable) {
            message = "Plugin JAR deleted but connector is still available (classpath or shared JAR). "
                    + "Restart may be required.";
        } else {
            message = "Plugin JAR uninstalled and registry reloaded.";
        }
        return new UninstallConnectorPluginResultDto(
                id,
                jarName,
                deleted,
                pendingDelete || (stillAvailable && wasLoaded),
                message + (reload.failures().isEmpty() ? "" : " Failures: " + reload.failures())
        );
    }

    /**
     * Deletes plugin JARs on disk that are not currently loaded into the registry
     * (classpath-shadowed thin JARs, failed loads, leftovers).
     */
    public CleanupConnectorPluginsResultDto cleanupRedundantPluginJars() {
        Path pluginsDir = connectorFacade.catalog().pluginsDirectory();
        List<String> loaded = connectorFacade.catalog().loadedPluginJarNames();
        List<String> onDisk = ConnectorPluginJarLocator.listAllJarNames(pluginsDir);
        List<String> candidates = onDisk.stream()
                .filter(name -> loaded.stream().noneMatch(loadedName -> loadedName.equalsIgnoreCase(name)))
                .toList();
        if (candidates.isEmpty()) {
            return new CleanupConnectorPluginsResultDto(
                    0,
                    List.of(),
                    List.of(),
                    "No redundant plugin JARs under config/plugins."
            );
        }
        connectorFacade.catalog().unloadPlugins();
        List<String> deleted = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        for (String jarName : candidates) {
            Path target = pluginsDir.resolve(jarName).normalize();
            if (!target.startsWith(pluginsDir.normalize())) {
                failed.add(jarName);
                continue;
            }
            try {
                if (connectorFacade.catalog().deletePluginJar(target)) {
                    deleted.add(jarName);
                }
            } catch (IOException ex) {
                failed.add(jarName);
            }
        }
        reloadPlugins();
        String message = "Deleted " + deleted.size() + " redundant plugin JAR(s)."
                + (failed.isEmpty() ? "" : " Failed: " + failed);
        return new CleanupConnectorPluginsResultDto(
                deleted.size(),
                List.copyOf(deleted),
                List.copyOf(failed),
                message
        );
    }

    public long pluginsDirectoryBytes() {
        return directorySize(connectorFacade.catalog().pluginsDirectory());
    }

    /** Workspace {@code config/plugins} directory used for connector JARs. */
    public Path pluginsDirectory() {
        return connectorFacade.catalog().pluginsDirectory();
    }

    private InstallConnectorPluginResultDto downloadRemotePlugin(String connectorId) {
        if (connectorId == null || connectorId.isBlank()) {
            throw new IllegalArgumentException("connectorId is required");
        }
        ConnectorPluginManifest manifest = connectorFacade.catalog().pluginManifest()
                .or(() -> connectorFacade.catalog().reloadPluginManifest())
                .orElseThrow(() -> new IllegalArgumentException(
                        "No config/plugins/manifest.json — add a manifest with downloadUrl before remote install"
                ));
        ConnectorPluginManifestEntry entry = ConnectorPluginManifestSupport.findById(manifest, connectorId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Connector not listed in manifest.json: " + connectorId
                ));
        Path pluginsDir = connectorFacade.catalog().pluginsDirectory();
        boolean hasRemote = entry.downloadUrl() != null && !entry.downloadUrl().isBlank();
        boolean hasLocal = ConnectorPluginRemoteInstallSupport
                .findLocalMarketJar(pluginsDir, entry.jar())
                .isPresent();
        if (!hasRemote && !hasLocal) {
            throw new IllegalArgumentException(
                    "Manifest entry for " + connectorId
                            + " has no downloadUrl and no JAR in config/market-cache/"
            );
        }
        try {
            Path installed = ConnectorPluginRemoteInstallSupport.install(
                    entry.downloadUrl(),
                    pluginsDir,
                    entry.jar(),
                    entry.sha256(),
                    downloadProperties.isRequireHttps(),
                    downloadProperties.getAllowedHosts()
            );
            connectorFacade.catalog().reloadPluginManifest();
            String integrity = entry.sha256() != null && !entry.sha256().isBlank()
                    ? ConnectorPluginIntegrityStatus.VERIFIED
                    : ConnectorPluginIntegrityStatus.UNSIGNED;
            return new InstallConnectorPluginResultDto(
                    entry.id(),
                    installed.getFileName().toString(),
                    integrity,
                    false,
                    "Plugin JAR downloaded"
            );
        } catch (IOException ex) {
            throw new IllegalStateException(
                    "Failed to download connector plugin " + connectorId + ": " + ex.getMessage(),
                    ex
            );
        }
    }

    private Optional<String> resolveInstalledJarName(String connectorId) {
        String loaded = connectorFacade.catalog().loadedJarByConnectorId().get(connectorId);
        if (loaded != null && !loaded.isBlank()) {
            return Optional.of(loaded);
        }
        Path pluginsDir = connectorFacade.catalog().pluginsDirectory();
        Optional<String> onDisk = ConnectorPluginJarLocator.findJarName(pluginsDir, connectorId);
        if (onDisk.isPresent()) {
            return onDisk;
        }
        return connectorFacade.catalog().pluginManifest()
                .or(() -> connectorFacade.catalog().reloadPluginManifest())
                .flatMap(manifest -> ConnectorPluginManifestSupport.findById(manifest, connectorId))
                .map(ConnectorPluginManifestEntry::jar)
                .filter(jar -> jar != null && !jar.isBlank())
                .filter(jar -> Files.isRegularFile(pluginsDir.resolve(jar)));
    }

    private static long directorySize(Path root) {
        if (root == null || !Files.isDirectory(root)) {
            return 0L;
        }
        try (var stream = Files.walk(root)) {
            return stream.filter(Files::isRegularFile)
                    .mapToLong(path -> {
                        try {
                            return Files.size(path);
                        } catch (IOException ex) {
                            return 0L;
                        }
                    })
                    .sum();
        } catch (IOException ex) {
            return 0L;
        }
    }

    /** Hot-reload {@code config/plugins} into the live connector registry. */
    public ConnectorPluginReloadResultDto reloadPlugins() {
        ConnectorPluginReloadResultDto result = connectorFacade.catalog().reloadPlugins();
        invalidateSnapshot();
        return result;
    }

    public ConnectorPluginLoadStatusDto pluginLoadStatus() {
        return connectorFacade.catalog().pluginLoadStatus();
    }

    /** Clears {@code config/plugins/.quarantine/} then hot-reloads remaining plugins. */
    public ConnectorPluginReloadResultDto clearQuarantinedPlugins() throws IOException {
        connectorFacade.catalog().clearQuarantinedPlugins();
        return reloadPlugins();
    }

    @EventListener
    public void onConnectorPluginsBootstrapped(ConnectorPluginsBootstrappedEvent event) {
        invalidateSnapshot();
    }

    public void invalidateSnapshot() {
        synchronized (this) {
            snapshot = null;
        }
    }

    public Optional<DatasourceDefinitionDto> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(snapshot().byId().get(catalogId(id)));
    }

    /**
     * 校验当前运行时是否已加载对应数据源插件；未加载则拒绝创建连接或执行操作。
     * Community plugin connections ({@code dbType=plugin}) use .dwp sidecars, not JDBC connectors.
     */
    public void requireAvailable(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            throw new DatasourceTypeRequiredException();
        }
        String normalized = catalogId(dbType);
        if (DbType.PLUGIN.matches(normalized)) {
            return;
        }
        if (!snapshot().byId().containsKey(normalized)) {
            throw new DatasourceNotAvailableException(normalized);
        }
    }

    /** Optional connector plugin JARs successfully loaded from {@code config/plugins}. */
    public List<String> loadedPluginJarNames() {
        return connectorFacade.catalog().loadedPluginJarNames();
    }

    /** Plugin JARs that failed to load; useful when a datasource type is missing at runtime. */
    public List<ConnectorPluginLoadFailure> pluginLoadFailures() {
        return connectorFacade.catalog().failedPluginLoads();
    }

    private CatalogSnapshot snapshot() {
        CatalogSnapshot current = snapshot;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (snapshot == null) {
                snapshot = buildSnapshot();
            }
            return snapshot;
        }
    }

    private CatalogSnapshot buildSnapshot() {
        List<DatasourceDefinitionDto> available = new ArrayList<>();
        Map<String, DatasourceDefinitionDto> byId = new LinkedHashMap<>();
        for (DbType type : DbType.catalogListed()) {
            if (!isImplemented(type.id())) {
                continue;
            }
            DataSourceConnector connector = connectorFacade.catalog().resolve(type.id());
            DbTypeCatalogEntry catalog = type.catalogEntry().orElseThrow();
            DatasourceDefinitionDto definition = new DatasourceDefinitionDto(
                    type.id(),
                    type.getDisplayName(),
                    catalog.primary(),
                    String.valueOf(type.getPort()),
                    catalog.jdbcDriverRequired(),
                    catalog.driverMaven(),
                    catalog.jdbcDriverRequired() ? catalog.resolveDriverClass(type) : null,
                    capabilityNames(ConnectorCapabilityCatalog.resolve(connector, type.id(), opsRegistry)),
                    type.getQuote()
            );
            available.add(definition);
            byId.put(type.id(), definition);
        }
        return new CatalogSnapshot(List.copyOf(available), Map.copyOf(byId));
    }

    private boolean isImplemented(String dbType) {
        try {
            return connectorFacade.catalog().supports(dbType);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static List<String> capabilityNames(EnumSet<ConnectorCapability> capabilities) {
        return capabilities.stream().map(Enum::name).sorted().toList();
    }

    private static String catalogId(String dbType) {
        return DbType.find(dbType).map(DbType::id).orElse(DbType.normalizeId(dbType));
    }

    private static String buildInstallHint(ConnectorPluginManifestEntry entry) {
        StringBuilder hint = new StringBuilder("Install connector plugin JAR under config/plugins");
        if (entry.jar() != null && !entry.jar().isBlank()) {
            hint.append(" as ").append(entry.jar());
        }
        hint.append(", then use marketplace Reload plugins (or restart).");
        if (entry.version() != null && !entry.version().isBlank()) {
            hint.append(" Manifest version: ").append(entry.version()).append('.');
        }
        if (entry.downloadUrl() != null && !entry.downloadUrl().isBlank()) {
            hint.append(" Download: ").append(entry.downloadUrl());
        }
        return hint.toString();
    }

    private record CatalogSnapshot(List<DatasourceDefinitionDto> available, Map<String, DatasourceDefinitionDto> byId) {
    }
}
