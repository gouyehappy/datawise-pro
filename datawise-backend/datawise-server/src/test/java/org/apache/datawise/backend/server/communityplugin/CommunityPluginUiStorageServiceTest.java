package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginUiStorageServiceTest {

    @TempDir
    Path temp;

    private CommunityPluginUiStorageService service() {
        return new CommunityPluginUiStorageService(new ConfigDirectoryService(temp), new ObjectMapper());
    }

    @Test
    void putAllMergesUpsertsAndDeletes() {
        CommunityPluginUiStorageService service = service();
        String pluginId = "io.datawise.community.ssh";
        Long user = 1L;

        service.putAll(pluginId, user, Map.of("quick-commands", "[{\"id\":1}]", "font-size", "14"));
        Map<String, String> updates = new HashMap<>();
        updates.put("font-size", "16");
        updates.put("gone", null);
        Map<String, String> values = service.putAll(pluginId, user, updates);

        assertEquals("[{\"id\":1}]", values.get("quick-commands"));
        assertEquals("16", values.get("font-size"));
        assertFalse(values.containsKey("gone"));

        // Persisted per user under the plugin data dir and survives a fresh service instance.
        assertTrue(Files.isRegularFile(temp.resolve("community-plugin-data")
                .resolve(pluginId).resolve("ui-storage").resolve("1.json")));
        assertEquals("16", service().getAll(pluginId, user).get("font-size"));
    }

    @Test
    void storageIsScopedPerUser() {
        CommunityPluginUiStorageService service = service();
        String pluginId = "io.datawise.community.ssh";

        service.putAll(pluginId, 1L, Map.of("font-size", "14"));
        service.putAll(pluginId, 2L, Map.of("font-size", "18"));

        assertEquals("14", service.getAll(pluginId, 1L).get("font-size"));
        assertEquals("18", service.getAll(pluginId, 2L).get("font-size"));
    }

    @Test
    void rejectsOversizedValuesBadPluginIdsAndAnonymous() {
        CommunityPluginUiStorageService service = service();
        assertThrows(CommunityPluginException.class,
                () -> service.putAll("io.datawise.community.ssh", 1L, Map.of("k", "x".repeat(3 * 1024 * 1024))));
        assertThrows(CommunityPluginException.class,
                () -> service.putAll("../escape", 1L, Map.of("k", "v")));
        assertThrows(CommunityPluginException.class,
                () -> service.putAll("io.datawise.community.ssh", 1L, Map.of(" ", "v")));
        assertThrows(CommunityPluginException.class,
                () -> service.getAll("io.datawise.community.ssh", null));
        assertThrows(CommunityPluginException.class,
                () -> service.getAll("io.datawise.community.ssh", 0L - 1));
    }
}
