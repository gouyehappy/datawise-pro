package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import org.springframework.beans.factory.ObjectProvider;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SchemaCacheStoreTest {

    @TempDir
    Path tempDir;

    private SchemaCacheStore store;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = mock(ConfigDirectoryService.class);
        when(configDirectory.resolve(org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(invocation -> tempDir.resolve(invocation.getArgument(0, String.class)));
        @SuppressWarnings("unchecked")
        ObjectProvider<org.apache.datawise.backend.service.discovery.DiscoverySearchIndexStore> indexProvider =
                mock(ObjectProvider.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<ConnectionStore> connectionProvider = mock(ObjectProvider.class);
        when(indexProvider.getIfAvailable()).thenReturn(null);
        when(connectionProvider.getIfAvailable()).thenReturn(null);
        store = new SchemaCacheStore(configDirectory, new ObjectMapper(), indexProvider, connectionProvider);
        UserContext.set(7L, false, "session-a");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void saveAndLoad_roundTripsThroughMemory() {
        TreeNode child = new TreeNode();
        child.setId("db-1");
        child.setLabel("sales");
        child.setType("database");
        store.save("conn-1", List.of(child));

        List<TreeNode> loaded = store.load("conn-1");
        assertEquals(1, loaded.size());
        assertEquals("sales", loaded.get(0).getLabel());
    }

    @Test
    void clear_removesMemoryAndDisk() {
        TreeNode child = new TreeNode();
        child.setId("db-1");
        child.setLabel("sales");
        child.setType("database");
        store.save("conn-1", List.of(child));
        store.clear("conn-1");

        assertTrue(store.load("conn-1").isEmpty());
    }

    @Test
    void hydrateFromDisk_afterMemoryCleared() {
        TreeNode child = new TreeNode();
        child.setId("db-1");
        child.setLabel("sales");
        child.setType("database");
        store.save("conn-1", List.of(child));
        store.clearSession("session-a");

        List<TreeNode> loaded = store.load("conn-1");
        assertEquals(1, loaded.size());
        assertEquals("sales", loaded.get(0).getLabel());
    }
}
