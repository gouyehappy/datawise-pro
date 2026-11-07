package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.GroupResult;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.ExplorerCatalogPersistence;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.apache.datawise.backend.service.project.ProjectService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ExplorerGroupServiceProjectScopeTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void createGroupStampsActiveProjectId() {
        SessionEphemeralCatalogStore ephemeral = new SessionEphemeralCatalogStore();
        ConnectionVisibilityService visibility = mock(ConnectionVisibilityService.class);
        ConnectionExecutionContext connectionContext = mock(ConnectionExecutionContext.class);
        ExplorerTreeBuilder treeBuilder = mock(ExplorerTreeBuilder.class);
        ProjectService projectService = mock(ProjectService.class);
        UserResourcePolicy resourcePolicy = new UserResourcePolicy(new UserAccessPolicy());
        ExplorerCatalogPersistence catalogPersistence = new ExplorerCatalogPersistence(
                resourcePolicy,
                ephemeral,
                mock(org.apache.datawise.backend.configstore.ConnectionStore.class),
                mock(org.apache.datawise.backend.service.tenant.TenantQuotaService.class),
                mock(org.apache.datawise.backend.service.outbound.OutboundEventSignals.class),
                mock(org.apache.datawise.backend.configstore.AiTableTagStore.class)
        );

        when(connectionContext.requireUserId()).thenReturn(3L);
        when(projectService.resolveActiveProjectId()).thenReturn("proj_halo");
        when(visibility.visibleCatalogForCurrentUser()).thenAnswer(invocation -> {
            var catalog = ephemeral.getCatalog("session-scope");
            return new ConnectionVisibilityService.VisibleCatalog(catalog.groups(), catalog.connections());
        });
        when(treeBuilder.buildGroups(any())).thenReturn(List.of());

        ExplorerGroupService service = new ExplorerGroupService(
                mock(org.apache.datawise.backend.configstore.ConnectionStore.class),
                ephemeral,
                treeBuilder,
                connectionContext,
                visibility,
                catalogPersistence,
                resourcePolicy,
                projectService
        );

        UserContext.set(3L, true, "session-scope");
        GroupResult result = service.createGroup("业务目录", null);

        assertNotNull(result.groupId());
        assertEquals(1, ephemeral.getCatalog("session-scope").groups().size());
        assertEquals("proj_halo", ephemeral.getCatalog("session-scope").groups().get(0).getProjectId());
        assertEquals("业务目录", ephemeral.getCatalog("session-scope").groups().get(0).getLabel());
    }

    @Test
    void createGroupFallsBackToDefaultWhenActiveProjectBlank() {
        SessionEphemeralCatalogStore ephemeral = new SessionEphemeralCatalogStore();
        ConnectionVisibilityService visibility = mock(ConnectionVisibilityService.class);
        ConnectionExecutionContext connectionContext = mock(ConnectionExecutionContext.class);
        ExplorerTreeBuilder treeBuilder = mock(ExplorerTreeBuilder.class);
        ProjectService projectService = mock(ProjectService.class);
        UserResourcePolicy resourcePolicy = new UserResourcePolicy(new UserAccessPolicy());
        ExplorerCatalogPersistence catalogPersistence = new ExplorerCatalogPersistence(
                resourcePolicy,
                ephemeral,
                mock(org.apache.datawise.backend.configstore.ConnectionStore.class),
                mock(org.apache.datawise.backend.service.tenant.TenantQuotaService.class),
                mock(org.apache.datawise.backend.service.outbound.OutboundEventSignals.class),
                mock(org.apache.datawise.backend.configstore.AiTableTagStore.class)
        );

        when(connectionContext.requireUserId()).thenReturn(3L);
        when(projectService.resolveActiveProjectId()).thenReturn("  ");
        when(visibility.visibleCatalogForCurrentUser()).thenAnswer(invocation -> {
            var catalog = ephemeral.getCatalog("session-fallback");
            return new ConnectionVisibilityService.VisibleCatalog(catalog.groups(), catalog.connections());
        });
        when(treeBuilder.buildGroups(any())).thenReturn(List.of());

        ExplorerGroupService service = new ExplorerGroupService(
                mock(org.apache.datawise.backend.configstore.ConnectionStore.class),
                ephemeral,
                treeBuilder,
                connectionContext,
                visibility,
                catalogPersistence,
                resourcePolicy,
                projectService
        );

        UserContext.set(3L, true, "session-fallback");
        service.createGroup("fallback", null);

        assertEquals(ProjectIds.DEFAULT, ephemeral.getCatalog("session-fallback").groups().get(0).getProjectId());
    }
}
