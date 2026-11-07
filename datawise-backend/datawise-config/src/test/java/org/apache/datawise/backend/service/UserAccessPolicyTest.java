package org.apache.datawise.backend.service;

import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class UserAccessPolicyTest {

    private final UserAccessPolicy policy = new UserAccessPolicy();

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void requireRegisteredUser_rejectsGuest() {
        UserContext.set(1L, true, "guest-session");
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, policy::requireRegisteredUser);
        assertEquals(UserAccessPolicy.GUEST_NOT_ALLOWED, ex.getMessage());
    }

    @Test
    void runGuestEphemeralOrRegistered_routesBySessionType() {
        SessionEphemeralCatalogStore ephemeral = new SessionEphemeralCatalogStore();
        ConnectionStore connectionStore = mock(ConnectionStore.class);
        UserResourcePolicy resourcePolicy = new UserResourcePolicy(policy);
        ExplorerCatalogPersistence catalogPersistence = new ExplorerCatalogPersistence(
                resourcePolicy,
                ephemeral,
                connectionStore,
                mock(org.apache.datawise.backend.service.tenant.TenantQuotaService.class),
                mock(org.apache.datawise.backend.service.outbound.OutboundEventSignals.class),
                mock(org.apache.datawise.backend.configstore.AiTableTagStore.class));

        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("group-guest");
        group.setLabel("guest-group");

        UserContext.set(9L, true, "session-guest");
        catalogPersistence.saveGroup(group);
        assertEquals(1, ephemeral.getCatalog("session-guest").groups().size());
        verify(connectionStore, never()).saveGroup(group);

        ConnectionGroupEntity registered = new ConnectionGroupEntity();
        registered.setId("group-user");
        registered.setLabel("registered-group");
        UserContext.set(7L, false, "session-user");
        catalogPersistence.saveGroup(registered);
        verify(connectionStore).saveGroup(registered);
    }

    @Test
    void runGuestEphemeralOrRegistered_supplierReturnsRegisteredValue() {
        UserContext.set(7L, false, "session-user");
        String value = policy.runGuestEphemeralOrRegistered(() -> "guest", () -> "registered");
        assertEquals("registered", value);
    }
}
