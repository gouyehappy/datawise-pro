package org.apache.datawise.backend.service;

import org.apache.datawise.backend.configstore.SchemaCacheStore;
import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GuestSessionCleanupServiceTest {

    @Mock
    private SessionEphemeralCatalogStore ephemeralCatalogStore;
    @Mock
    private SchemaCacheStore schemaCacheStore;
    @Mock
    private ConnectionRuntimeCleanup connectionRuntimeCleanup;

    @Test
    void cleanupSessionRemovesGuestCatalogAndSchemaCache() {
        GuestSessionCleanupService service = new GuestSessionCleanupService(
                ephemeralCatalogStore,
                schemaCacheStore,
                connectionRuntimeCleanup);
        whenListConnectionIds();

        service.cleanupSession("session-guest", true);

        verify(ephemeralCatalogStore).listConnectionIds("session-guest");
        verify(ephemeralCatalogStore).removeSession("session-guest");
        verify(schemaCacheStore).clearSession("session-guest");
        verify(connectionRuntimeCleanup).onSessionCleanup("session-guest", true, List.of("conn-a"));
    }

    private void whenListConnectionIds() {
        org.mockito.Mockito.when(ephemeralCatalogStore.listConnectionIds("session-guest"))
                .thenReturn(List.of("conn-a"));
    }
}
