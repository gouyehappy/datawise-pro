package org.apache.datawise.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.AppConfigStore;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.FileConnectionStore;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfigSecretsMigrationServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void migratesPlaintextConnectionAndAppSecrets() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ObjectMapper objectMapper = new ObjectMapper();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);

        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("g1");
        group.setLabel("G");
        group.setSortOrder(0);
        group.setExpanded(true);
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("c1");
        connection.setGroupId("g1");
        connection.setName("DB");
        connection.setDbType("mysql");
        connection.setPassword("legacy-pass");
        ConnectionsXmlCodec.write(
                tempDir.resolve(ConfigPaths.CONNECTIONS),
                List.of(group),
                List.of(connection),
                objectMapper);

        Path appPath = tempDir.resolve(ConfigPaths.APP);
        Files.createDirectories(tempDir);
        Files.writeString(
                appPath,
                """
                        <?xml version="1.0" encoding="UTF-8"?>
                        <datawise-app version="2">
                          <ai><![CDATA[{"llmProfiles":[{"id":"llm-1","name":"Default","provider":"openai","apiKey":"sk-plain","baseUrl":"https://api.example.com","model":"gpt-4"}],"defaultLlmId":"llm-1","workbenchLlmId":"llm-1","sideActivePanel":"scope"}]]></ai>
                        </datawise-app>
                        """,
                StandardCharsets.UTF_8);

        ConnectionStore connectionStore = new FileConnectionStore(configDirectory, objectMapper, codec);
        AppConfigStore appConfigStore = new AppConfigStore(configDirectory, objectMapper, codec);
        ConfigSecretsMigrationService migrationService = new ConfigSecretsMigrationService(
                connectionStore,
                appConfigStore);

        Path connectionsPath = tempDir.resolve(TenantScopedConfigSupport.defaultTenantConnectionsPath());
        String connectionsBefore = Files.readString(connectionsPath, StandardCharsets.UTF_8);
        String appBefore = Files.readString(tempDir.resolve(ConfigPaths.APP), StandardCharsets.UTF_8);
        assertTrue(connectionsBefore.contains("legacy-pass"));
        assertTrue(appBefore.contains("sk-plain"));

        ConfigSecretsMigrationService.MigrationReport first = migrationService.migrateIfNeeded();
        assertEquals(1, first.connectionSecretFields());
        assertEquals(1, first.llmApiKeys());

        String connectionsAfterFirst = Files.readString(connectionsPath, StandardCharsets.UTF_8);
        String appAfterFirst = Files.readString(appPath, StandardCharsets.UTF_8);
        assertFalse(connectionsAfterFirst.contains("legacy-pass"));
        assertTrue(connectionsAfterFirst.contains(SecretValueCodec.PREFIX));
        assertFalse(appAfterFirst.contains("sk-plain"));
        assertTrue(appAfterFirst.contains(SecretValueCodec.PREFIX));

        ConfigSecretsMigrationService.MigrationReport second = migrationService.migrateIfNeeded();
        assertEquals(0, second.connectionSecretFields());
        assertEquals(0, second.llmApiKeys());

        assertEquals("legacy-pass", connectionStore.findConnectionById("c1").orElseThrow().getPassword());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> profiles = (List<Map<String, Object>>) ((Map<String, Object>) appConfigStore.readAppConfig().orElseThrow().get("ai")).get("llmProfiles");
        assertEquals("sk-plain", profiles.get(0).get("apiKey"));
    }

    @Test
    void migratesPlaintextApiKeyWhenAlreadyEncryptedConnections() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ObjectMapper objectMapper = new ObjectMapper();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ConnectionStore connectionStore = new FileConnectionStore(configDirectory, objectMapper, codec);
        AppConfigStore appConfigStore = new AppConfigStore(configDirectory, objectMapper, codec);
        ConfigSecretsMigrationService migrationService = new ConfigSecretsMigrationService(
                connectionStore,
                appConfigStore);

        Path appPath = tempDir.resolve(ConfigPaths.APP);
        Files.createDirectories(tempDir);
        Files.writeString(
                appPath,
                """
                        <?xml version="1.0" encoding="UTF-8"?>
                        <datawise-app version="2">
                          <ai><![CDATA[{"llmProfiles":[{"id":"llm-1","name":"Default","provider":"openai","apiKey":"sk-only-plain","baseUrl":"https://api.example.com","model":"gpt-4"}]}]]></ai>
                        </datawise-app>
                        """,
                StandardCharsets.UTF_8);

        ConfigSecretsMigrationService.MigrationReport report = migrationService.migrateIfNeeded();
        assertEquals(0, report.connectionSecretFields());
        assertEquals(1, report.llmApiKeys());

        String appAfter = Files.readString(appPath, StandardCharsets.UTF_8);
        assertFalse(appAfter.contains("sk-only-plain"));
        assertTrue(appAfter.contains(SecretValueCodec.PREFIX));
    }
}
