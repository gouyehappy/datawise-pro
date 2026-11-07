package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.GroupResult;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.ExplorerCatalogPersistence;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ExplorerGroupServiceGuestTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void guestCreateGroupPersistsToEphemeralCatalog() {
        SessionEphemeralCatalogStore ephemeral = new SessionEphemeralCatalogStore();
        ConnectionVisibilityService visibility = mock(ConnectionVisibilityService.class);
        ConnectionExecutionContext connectionContext = mock(ConnectionExecutionContext.class);
        ExplorerTreeBuilder treeBuilder = mock(ExplorerTreeBuilder.class);
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
        when(visibility.resolveGroupEntity(any())).thenReturn(java.util.Optional.empty());
        when(visibility.visibleCatalogForCurrentUser()).thenAnswer(invocation -> {
            var catalog = ephemeral.getCatalog("session-guest");
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
                mock(org.apache.datawise.backend.service.project.ProjectService.class)
        );

        UserContext.set(3L, true, "session-guest");
        GroupResult result = service.createGroup("测试目录", null);

        assertNotNull(result.groupId());
        assertFalse(result.groupId().isBlank());
        assertEquals(1, ephemeral.getCatalog("session-guest").groups().size());
        assertEquals("测试目录", ephemeral.getCatalog("session-guest").groups().get(0).getLabel());
    }
}
