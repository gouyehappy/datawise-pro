package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.domain.JdbcDriverCatalogDto;
import org.apache.datawise.backend.domain.RuntimeOverviewDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RuntimeOverviewServiceTest {

    @Mock
    private DatasourceCatalogService datasourceCatalogService;

    @Mock
    private JdbcDriverService jdbcDriverService;

    @TempDir
    Path tempDir;

    @Test
    void overviewReadsDesktopPackagingMarker() throws Exception {
        Files.writeString(
                tempDir.resolve("desktop-packaging.json"),
                """
                {"profile":"core","connectors":"curated","drivers":"download-on-connect"}
                """
        );
        stubRuntime();
        RuntimeOverviewService service = new RuntimeOverviewService(
                datasourceCatalogService,
                jdbcDriverService,
                tempDir.toString()
        );
        RuntimeOverviewDto.RuntimePackagingDto packaging = service.overview().packaging();
        assertEquals("core", packaging.profile());
        assertEquals("curated", packaging.connectors());
        assertEquals("download-on-connect", packaging.drivers());
    }

    @Test
    void overviewFallsBackToDevWhenMarkerMissing() throws Exception {
        stubRuntime();
        RuntimeOverviewService service = new RuntimeOverviewService(
                datasourceCatalogService,
                jdbcDriverService,
                tempDir.toString()
        );
        RuntimeOverviewDto.RuntimePackagingDto packaging = service.overview().packaging();
        assertEquals("dev", packaging.profile());
        assertEquals("workspace", packaging.connectors());
        assertEquals("local-or-download", packaging.drivers());
    }

    private void stubRuntime() {
        when(jdbcDriverService.listCached()).thenReturn(new JdbcDriverCatalogDto(
                List.of(),
                List.of(),
                List.of(),
                0L,
                tempDir.resolve("drivers").toString()
        ));
        when(datasourceCatalogService.pluginsDirectoryBytes()).thenReturn(0L);
        when(datasourceCatalogService.loadedPluginJarNames()).thenReturn(List.of());
        when(datasourceCatalogService.pluginLoadFailures()).thenReturn(List.of());
    }
}
