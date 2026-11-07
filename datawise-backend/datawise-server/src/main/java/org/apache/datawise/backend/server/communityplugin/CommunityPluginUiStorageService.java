package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.DwpCodec;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Key-value UI storage for community plugin workbenches, persisted under the
 * plugin data dir ({@code <workspace>/community-plugin-data/<pluginId>/ui-storage/<userId>.json}).
 * The workspace folder name comes from the host and is not hard-coded.
 * <p>
 * This backs the {@code datawisePlugin.storage} Host API (hostApi 1.2). Workbench
 * iframes run at an opaque origin (sandbox without {@code allow-same-origin}) and
 * therefore have no localStorage — UI preferences and history persist here instead,
 * through the bridge. Storage is scoped per user (the calling session's user id):
 * plugin preferences and history are user data, not shared plugin state. Values
 * are plain strings owned by the plugin; no user data flows in unless the plugin
 * puts it there.
 */
@Service
public class CommunityPluginUiStorageService {

    static final int MAX_ENTRIES = 256;
    static final int MAX_KEY_LENGTH = 128;
    /** Per-value cap. Workbench plugins (e.g. HTTP client collections) need more than a small prefs blob. */
    static final int MAX_VALUE_BYTES = 2 * 1024 * 1024;
    /** Aggregate cap across all keys for one user × plugin. */
    static final long MAX_TOTAL_BYTES = 8L * 1024 * 1024;

    private static final String DIR_NAME = "ui-storage";

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;

    public CommunityPluginUiStorageService(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public synchronized Map<String, String> getAll(String pluginId, Long userId) {
        Path file = fileFor(pluginId, userId);
        if (!Files.isRegularFile(file)) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, String> values = objectMapper.readValue(file.toFile(), new TypeReference<>() {
            });
            return values != null ? values : new LinkedHashMap<>();
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to read plugin UI storage: " + e.getMessage(), e);
        }
    }

    /**
     * Merge-write: entries with non-null values upsert, {@code null} values delete.
     */
    public synchronized Map<String, String> putAll(String pluginId, Long userId, Map<String, String> entries) {
        if (entries == null || entries.isEmpty()) {
            return getAll(pluginId, userId);
        }
        Map<String, String> values = getAll(pluginId, userId);
        for (Map.Entry<String, String> entry : entries.entrySet()) {
            String key = entry.getKey();
            if (key == null || key.isBlank()) {
                throw new CommunityPluginException("UI storage key must not be blank");
            }
            if (key.length() > MAX_KEY_LENGTH) {
                throw new CommunityPluginException("UI storage key exceeds " + MAX_KEY_LENGTH + " chars");
            }
            String value = entry.getValue();
            if (value == null) {
                values.remove(key);
            } else {
                if (value.length() > MAX_VALUE_BYTES) {
                    throw new CommunityPluginException(
                            "UI storage value exceeds " + MAX_VALUE_BYTES + " chars: " + key);
                }
                values.put(key, value);
            }
        }
        if (values.size() > MAX_ENTRIES) {
            throw new CommunityPluginException("UI storage exceeds " + MAX_ENTRIES + " entries");
        }
        long total = 0;
        for (Map.Entry<String, String> entry : values.entrySet()) {
            total += (long) entry.getKey().length() + entry.getValue().length();
        }
        if (total > MAX_TOTAL_BYTES) {
            throw new CommunityPluginException("UI storage exceeds " + MAX_TOTAL_BYTES + " bytes");
        }
        persist(pluginId, userId, values);
        return values;
    }

    private void persist(String pluginId, Long userId, Map<String, String> values) {
        try {
            Path file = fileFor(pluginId, userId);
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName().toString() + ".tmp");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(tmp.toFile(), values);
            org.apache.datawise.backend.common.support.AtomicFileWrites.moveReplace(tmp, file);
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to write plugin UI storage: " + e.getMessage(), e);
        }
    }

    private Path fileFor(String pluginId, Long userId) {
        DwpCodec.validatePluginId(pluginId);
        if (userId == null) {
            throw new CommunityPluginException("UI storage requires an authenticated user");
        }
        String userPart = String.valueOf(userId);
        if (userId <= 0 || !userPart.matches("[0-9]{1,19}")) {
            throw new CommunityPluginException("Invalid UI storage user id");
        }
        return configDirectory.resolve(ConfigPaths.COMMUNITY_PLUGIN_DATA_DIR)
                .resolve(pluginId)
                .resolve(DIR_NAME)
                .resolve(userPart + ".json");
    }
}
