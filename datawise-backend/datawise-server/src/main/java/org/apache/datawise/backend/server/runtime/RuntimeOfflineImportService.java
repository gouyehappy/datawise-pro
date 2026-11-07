package org.apache.datawise.backend.server.runtime;

import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.database.connection.DatasourceCatalogService;
import org.apache.datawise.backend.domain.ConnectorPluginReloadResultDto;
import org.apache.datawise.backend.domain.RuntimeOfflineImportResultDto;
import org.apache.datawise.backend.jdbc.support.JdbcDriverLoader;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/**
 * Imports an offline runtime zip (connectors + JDBC drivers) into the workspace config tree.
 *
 * @see RuntimeOfflineZipSupport for zip layout
 */
@Service
public class RuntimeOfflineImportService {

    private final ConfigDirectoryService configDirectory;
    private final DatasourceCatalogService datasourceCatalogService;
    private final JdbcDriverLoader jdbcDriverLoader;

    public RuntimeOfflineImportService(
            ConfigDirectoryService configDirectory,
            DatasourceCatalogService datasourceCatalogService,
            JdbcDriverLoader jdbcDriverLoader
    ) {
        this.configDirectory = configDirectory;
        this.datasourceCatalogService = datasourceCatalogService;
        this.jdbcDriverLoader = jdbcDriverLoader;
    }

    public RuntimeOfflineImportResultDto importFromPath(String path) {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("zip path is required");
        }
        Path file = Path.of(path.trim()).toAbsolutePath().normalize();
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("zip file not found: " + file);
        }
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (!name.endsWith(".zip")) {
            throw new IllegalArgumentException("file must end with .zip");
        }

        Path pluginsDir = datasourceCatalogService.pluginsDirectory();
        Path driversDir = jdbcDriverLoader.driversDirectory();
        Path configRoot = configDirectory.getRoot();

        RuntimeOfflineZipSupport.ExtractResult extracted;
        try {
            extracted = RuntimeOfflineZipSupport.extract(file, pluginsDir, driversDir, configRoot);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to import offline runtime zip: " + ex.getMessage(), ex);
        }

        ConnectorPluginReloadResultDto reload = !extracted.pluginJars().isEmpty()
                ? datasourceCatalogService.reloadPlugins()
                : new ConnectorPluginReloadResultDto(0, List.of(), List.of());

        String message = "Imported "
                + extracted.pluginJars().size() + " plugin jar(s), "
                + extracted.driverJars().size() + " driver jar(s)"
                + (extracted.catalogOverlay() ? ", runtime-catalog.json overlay applied" : "")
                + ".";
        if (!extracted.pluginJars().isEmpty() && reload.failures() != null && !reload.failures().isEmpty()) {
            message += " Plugin reload failures: " + reload.failures();
        }

        return new RuntimeOfflineImportResultDto(
                extracted.pluginJars(),
                extracted.driverJars(),
                extracted.catalogOverlay(),
                reload,
                message
        );
    }
}
