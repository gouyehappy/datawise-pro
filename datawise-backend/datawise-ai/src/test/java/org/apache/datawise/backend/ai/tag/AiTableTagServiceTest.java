package org.apache.datawise.backend.ai.tag;

import org.apache.datawise.backend.configstore.AiTableTagStore;
import org.apache.datawise.backend.domain.AiTableTagCatalogItemDto;
import org.apache.datawise.backend.domain.UpdateAiTableTagsRequest;
import org.apache.datawise.backend.model.AiTableTagEntry;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiTableTagServiceTest {

    private AiTableTagStore store;
    private ConnectionVisibilityService connectionVisibilityService;
    private AiTableTagService service;

    @BeforeEach
    void setUp() {
        store = mock(AiTableTagStore.class);
        connectionVisibilityService = mock(ConnectionVisibilityService.class);
        service = new AiTableTagService(store, connectionVisibilityService);
    }

    @Test
    void filterTaggedTablesReturnsOnlyTaggedCandidates() {
        when(store.listScoped("conn-1", "shop")).thenReturn(List.of(entry("orders"), entry("users")));

        List<String> filtered = service.filterTaggedTables(
                "conn-1",
                "shop",
                List.of("orders", "products", "users")
        );

        assertEquals(List.of("orders", "users"), filtered);
    }

    @Test
    void filterTaggedTablesReturnsEmptyWhenNothingTagged() {
        when(store.listScoped("conn-1", "shop")).thenReturn(List.of());

        assertTrue(service.filterTaggedTables("conn-1", "shop", List.of("orders")).isEmpty());
    }

    @Test
    void updateTagsAddsAndRemovesEntries() {
        when(store.listScoped("conn-1", "shop")).thenReturn(List.of(entry("orders")));

        service.updateTags(new UpdateAiTableTagsRequest(
                "conn-1",
                "shop",
                List.of("orders", "users"),
                true
        ));
        verify(store, times(2)).upsert(any(AiTableTagEntry.class));

        service.updateTags(new UpdateAiTableTagsRequest(
                "conn-1",
                "shop",
                List.of("orders"),
                false
        ));
        verify(store).removeScoped("conn-1", "shop", "orders");
    }

    @Test
    void entryIdIsStableForSameScope() {
        assertEquals(
                AiTableTagService.entryId("conn-1", "shop", "Orders"),
                AiTableTagService.entryId("conn-1", "shop", "orders")
        );
    }

    @Test
    void listCatalogPrunesOrphansAndReturnsOnlyLiveConnections() {
        ConnectionEntity live = new ConnectionEntity();
        live.setId("conn-1");
        live.setName("Shop DB");
        when(connectionVisibilityService.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(List.of(), List.of(live)));

        AiTableTagEntry keep = entry("orders");
        keep.setConnectionId("conn-1");
        keep.setDatabase("shop");
        AiTableTagEntry orphan = entry("users");
        orphan.setConnectionId("conn-gone");
        orphan.setDatabase("shop");
        when(store.listAll()).thenReturn(List.of(keep, orphan));

        List<AiTableTagCatalogItemDto> catalog = service.listCatalog();

        verify(store).pruneMissingConnections(eq(Set.of("conn-1")));
        assertEquals(1, catalog.size());
        assertEquals("conn-1", catalog.get(0).connectionId());
        assertEquals("orders", catalog.get(0).tableName());
    }

    private static AiTableTagEntry entry(String tableName) {
        AiTableTagEntry entry = new AiTableTagEntry();
        entry.setTableName(tableName);
        return entry;
    }
}
