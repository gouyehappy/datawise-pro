package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AppConfigStoreTest {

    @TempDir
    Path tempDir;

    @Test
    void writeAndReadAppConfigRoundTrip() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        AppConfigStore store = new AppConfigStore(configDirectory, new ObjectMapper(), codec);

        Map<String, Object> config = new LinkedHashMap<>();
        config.put("version", 2);
        config.put("exportedAt", "2026-06-17T00:00:00Z");
        config.put("locale", "zh-CN");
        Map<String, Object> layout = new LinkedHashMap<>();
        layout.put("showExplorerPanel", true);
        layout.put("explorerWidth", 280);
        config.put("layout", layout);

        store.writeAppConfig(config);

        Path appXml = tempDir.resolve(ConfigPaths.APP);
        assertTrue(appXml.toFile().isFile());

        Map<String, Object> restored = store.readAppConfig().orElseThrow();
        assertEquals(2, restored.get("version"));
        assertEquals("zh-CN", restored.get("locale"));
        @SuppressWarnings("unchecked")
        Map<String, Object> restoredLayout = (Map<String, Object>) restored.get("layout");
        assertEquals(true, restoredLayout.get("showExplorerPanel"));
        assertEquals(280, restoredLayout.get("explorerWidth"));
    }

    @Test
    void readAppConfig_treatsEmptyFileAsMissing() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        AppConfigStore store = new AppConfigStore(configDirectory, new ObjectMapper(), codec);

        Path appXml = tempDir.resolve(ConfigPaths.APP);
        Files.writeString(appXml, "");

        assertTrue(store.readAppConfig().isEmpty());
        assertTrue(Files.list(tempDir).anyMatch(path -> path.getFileName().toString().startsWith("app.xml.corrupt-")));
    }

    @Test
    void encryptsApiKeyOnDiskAndDecryptsOnRead() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        AppConfigStore store = new AppConfigStore(configDirectory, new ObjectMapper(), codec);

        Map<String, Object> ai = new LinkedHashMap<>();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", "llm-1");
        profile.put("name", "Default");
        profile.put("provider", "openai");
        profile.put("apiKey", "sk-live-key");
        profile.put("baseUrl", "https://api.example.com");
        profile.put("model", "gpt-4");
        ai.put("llmProfiles", java.util.List.of(profile));
        ai.put("defaultLlmId", "llm-1");
        ai.put("workbenchLlmId", "llm-1");
        ai.put("sideActivePanel", "scope");

        Map<String, Object> config = new LinkedHashMap<>();
        config.put("version", 2);
        config.put("ai", ai);
        store.writeAppConfig(config);

        String xml = java.nio.file.Files.readString(tempDir.resolve(ConfigPaths.APP));
        assertFalse(xml.contains("sk-live-key"));
        assertTrue(xml.contains(SecretValueCodec.PREFIX));

        @SuppressWarnings("unchecked")
        Map<String, Object> restoredAi = (Map<String, Object>) store.readAppConfig().orElseThrow().get("ai");
        @SuppressWarnings("unchecked")
        Map<String, Object> restoredProfile = (Map<String, Object>) ((java.util.List<?>) restoredAi.get("llmProfiles")).get(0);
        assertEquals("sk-live-key", restoredProfile.get("apiKey"));
    }

    @Test
    void writeAppConfig_preservesBlankApiKeyFromExisting() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        AppConfigStore store = new AppConfigStore(configDirectory, new ObjectMapper(), codec);

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", "llm-1");
        profile.put("name", "Default");
        profile.put("apiKey", "sk-live-key");
        Map<String, Object> ai = new LinkedHashMap<>();
        ai.put("llmProfiles", java.util.List.of(profile));
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("version", 2);
        config.put("ai", ai);
        store.writeAppConfig(config);

        Map<String, Object> updateProfile = new LinkedHashMap<>();
        updateProfile.put("id", "llm-1");
        updateProfile.put("name", "Renamed");
        updateProfile.put("apiKey", "");
        Map<String, Object> updateAi = new LinkedHashMap<>();
        updateAi.put("llmProfiles", java.util.List.of(updateProfile));
        Map<String, Object> update = new LinkedHashMap<>();
        update.put("version", 2);
        update.put("ai", updateAi);
        store.writeAppConfig(update);

        @SuppressWarnings("unchecked")
        Map<String, Object> restoredAi = (Map<String, Object>) store.readAppConfig().orElseThrow().get("ai");
        @SuppressWarnings("unchecked")
        Map<String, Object> restoredProfile = (Map<String, Object>) ((java.util.List<?>) restoredAi.get("llmProfiles")).get(0);
        assertEquals("sk-live-key", restoredProfile.get("apiKey"));
        assertEquals("Renamed", restoredProfile.get("name"));
    }

    @Test
    void readSqlSnippets_treatsEmptyFileAsMissing() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        AppConfigStore store = new AppConfigStore(configDirectory, new ObjectMapper(), codec);

        Path shared = tempDir.resolve(ConfigPaths.tenantSqlSnippetsShared("default"));
        Files.createDirectories(shared.getParent());
        Files.writeString(shared, "");

        assertTrue(store.readSqlSnippets("shared").isEmpty());
        assertTrue(Files.list(shared.getParent()).anyMatch(
                path -> path.getFileName().toString().startsWith("sql-snippets.shared.xml.corrupt-")));
    }

    @Test
    void migratePlaintextSecretsIfNeeded_quarantinesCorruptAppConfig() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        AppConfigStore store = new AppConfigStore(configDirectory, new ObjectMapper(), codec);

        Path appXml = tempDir.resolve(ConfigPaths.APP);
        Files.writeString(appXml, "<not-valid-xml");

        assertEquals(0, store.migratePlaintextSecretsIfNeeded());
        assertTrue(Files.list(tempDir).anyMatch(path -> path.getFileName().toString().startsWith("app.xml.corrupt-")));
    }
}
