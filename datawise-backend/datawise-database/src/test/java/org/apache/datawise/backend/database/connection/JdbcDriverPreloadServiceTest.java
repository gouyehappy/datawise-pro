package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.jdbc.support.JdbcDriverDefaultsProvider;
import org.apache.datawise.backend.jdbc.support.JdbcDriverLoader;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JdbcDriverPreloadServiceTest {

    @Mock
    private JdbcDriverLoader jdbcDriverLoader;

    @Mock
    private JdbcDriverDefaultsProvider defaultsProvider;

    @Mock
    private ConnectionStore connectionStore;

    @InjectMocks
    private JdbcDriverPreloadService preloadService;

    @Test
    void preloadExistingDrivers_loadsCachedJarsFromSeedAndConnections() {
        when(defaultsProvider.allDefaults()).thenReturn(List.of(
                new JdbcDriverDefaultsProvider.DriverDefaults(
                        "com.mysql:mysql-connector-j:8.4.0",
                        "com.mysql.cj.jdbc.Driver"
                )
        ));
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-1");
        connection.setGroupId("group-1");
        connection.setDbType("postgresql");
        connection.setDriver("org.postgresql:postgresql:42.7.4");
        connection.setDriverClass("org.postgresql.Driver");
        when(connectionStore.findAllConnections()).thenReturn(List.of(connection));
        when(jdbcDriverLoader.preloadIfPresent("com.mysql:mysql-connector-j:8.4.0", "com.mysql.cj.jdbc.Driver"))
                .thenReturn(Optional.of(new JdbcDriverLoader.LoadedDriver(null, Path.of("mysql.jar"), false, true, null)));
        when(jdbcDriverLoader.preloadIfPresent("org.postgresql:postgresql:42.7.4", "org.postgresql.Driver"))
                .thenReturn(Optional.empty());

        JdbcDriverPreloadService.PreloadReport report = preloadService.preloadExistingDrivers();

        assertEquals(1, report.preloaded());
        assertEquals(1, report.skipped());
        assertEquals(0, report.failed());
    }

    @Test
    void preloadExistingDrivers_skipsRedisConnections() {
        when(defaultsProvider.allDefaults()).thenReturn(List.of());
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-redis");
        connection.setGroupId("group-1");
        connection.setDbType("redis");
        when(connectionStore.findAllConnections()).thenReturn(List.of(connection));

        JdbcDriverPreloadService.PreloadReport report = preloadService.preloadExistingDrivers();

        assertEquals(0, report.preloaded());
        verify(jdbcDriverLoader, never()).preloadIfPresent(anyString(), anyString());
    }
}
