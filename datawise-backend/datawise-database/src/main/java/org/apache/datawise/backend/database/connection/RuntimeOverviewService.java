package org.apache.datawise.backend.database.connection;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.support.ConfigDirectoryLocator;
import org.apache.datawise.backend.domain.JdbcDriverCatalogDto;
import org.apache.datawise.backend.domain.RuntimeOverviewDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Service
public class RuntimeOverviewService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final DatasourceCatalogService datasourceCatalogService;
    private final JdbcDriverService jdbcDriverService;
    private final Path configRoot;

    public RuntimeOverviewService(
            DatasourceCatalogService datasourceCatalogService,
            JdbcDriverService jdbcDriverService,
            @Value("${datawise.config.dir:config}") String configDir
    ) throws IOException {
        this.datasourceCatalogService = datasourceCatalogService;
        this.jdbcDriverService = jdbcDriverService;
        this.configRoot = ConfigDirectoryLocator.resolve(configDir).toAbsolutePath().normalize();
    }

    public RuntimeOverviewDto overview() {
        JdbcDriverCatalogDto drivers = jdbcDriverService.listCached();
        long pluginsBytes = datasourceCatalogService.pluginsDirectoryBytes();
        int installed = datasourceCatalogService.loadedPluginJarNames().size();
        int catalogTotal = DbType.catalogListed().size();
        String jreSource = System.getProperty("datawise.runtime.jre.source", "unknown");
        RuntimeOverviewDto.RuntimeJreDto jre = new RuntimeOverviewDto.RuntimeJreDto(
                System.getProperty("java.version", ""),
                System.getProperty("java.vendor", ""),
                System.getProperty("java.home", ""),
                jreSource
        );
        RuntimeOverviewDto.RuntimeConnectorsDto connectors = new RuntimeOverviewDto.RuntimeConnectorsDto(
                installed,
                catalogTotal,
                pluginsBytes,
                datasourceCatalogService.pluginLoadFailures()
        );
        RuntimeOverviewDto.RuntimeDriversDto driversDto = new RuntimeOverviewDto.RuntimeDriversDto(
                drivers.drivers().size(),
                drivers.totalBytes()
        );
        RuntimeOverviewDto.RuntimeWorkspaceDto workspace = new RuntimeOverviewDto.RuntimeWorkspaceDto(
                configRoot.toString(),
                pluginsBytes + drivers.totalBytes()
        );
        return new RuntimeOverviewDto(jre, connectors, driversDto, workspace, readPackaging());
    }

    private RuntimeOverviewDto.RuntimePackagingDto readPackaging() {
        Path marker = configRoot.resolve("desktop-packaging.json");
        if (!Files.isRegularFile(marker)) {
            return new RuntimeOverviewDto.RuntimePackagingDto("dev", "workspace", "local-or-download");
        }
        try {
            JsonNode root = JSON.readTree(Files.readString(marker));
            String profile = textOr(root, "profile", "unknown");
            String connectors = textOr(root, "connectors", "unknown");
            String driversPolicy = textOr(root, "drivers", "download-on-connect");
            return new RuntimeOverviewDto.RuntimePackagingDto(profile, connectors, driversPolicy);
        } catch (IOException ignored) {
            return new RuntimeOverviewDto.RuntimePackagingDto("unknown", "unknown", "unknown");
        }
    }

    private static String textOr(JsonNode root, String field, String fallback) {
        JsonNode node = root.get(field);
        if (node == null || node.isNull() || !node.isTextual()) {
            return fallback;
        }
        String value = node.asText("").trim();
        return value.isEmpty() ? fallback : value;
    }
}
