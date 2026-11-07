package org.apache.datawise.backend.server.controller.system;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.LegacyConfigPathMigrationService;
import org.apache.datawise.backend.controller.system.HealthController;
import org.apache.datawise.backend.domain.HealthStatusDto;
import org.apache.datawise.backend.domain.SystemMetricsDto;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.server.deployment.DeploymentProfileService;
import org.apache.datawise.backend.server.metrics.SystemMetricsService;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HealthControllerTest {

    @Mock
    private InstanceWorkspaceService instanceWorkspaceService;
    @Mock
    private SystemMetricsService systemMetricsService;
    @Mock
    private DeploymentProfileService deploymentProfileService;
    @Mock
    private ConfigDirectoryService configDirectoryService;
    @Mock
    private UserAccessPolicy userAccessPolicy;
    @Mock
    private UserAdminPolicy userAdminPolicy;
    @Mock
    private LegacyConfigPathMigrationService legacyConfigPathMigrationService;

    @InjectMocks
    private HealthController controller;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void healthExposesConfigDirButHidesScriptsForAnonymousCallers() {
        when(configDirectoryService.getRoot()).thenReturn(Path.of("/workspace"));

        var response = controller.health().data();

        assertEquals("ok", response.status());
        assertNull(response.scriptsDir());
        assertEquals(Path.of("/workspace").toString(), response.configDir());
    }

    @Test
    void healthReturnsPathsForRegisteredUsers() {
        UserContext.set(1L, false, "session-1");
        when(instanceWorkspaceService.scriptsRoot()).thenReturn("/scripts");
        when(configDirectoryService.getRoot()).thenReturn(Path.of("/config"));

        HealthStatusDto response = controller.health().data();

        assertEquals("/scripts", response.scriptsDir());
        assertEquals(Path.of("/config").toString(), response.configDir());
    }

    @Test
    void systemMetricsRequiresAuthentication() {
        assertThrows(UnauthorizedException.class, controller::systemMetrics);
    }

    @Test
    void systemMetricsReturnsMetricsForRegisteredUsers() {
        UserContext.set(1L, false, "session-1");
        SystemMetricsDto metrics = new SystemMetricsDto(
                "2026-01-01T00:00:00Z",
                "ok",
                1000L,
                null,
                null,
                List.of()
        );
        when(systemMetricsService.collect()).thenReturn(metrics);

        assertEquals(metrics, controller.systemMetrics().data());
        verify(userAccessPolicy).requireRegisteredUser();
    }
}
