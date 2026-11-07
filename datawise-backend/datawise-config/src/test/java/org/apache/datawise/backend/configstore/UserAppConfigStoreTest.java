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

class UserAppConfigStoreTest {

    @TempDir
    Path tempDir;

    @Test
    void readAppConfig_recoversFromEmptyUserFileViaGlobalMigration() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper();
        AppConfigStore appConfigStore = new AppConfigStore(configDirectory, objectMapper, codec);
        UserAppConfigStore userStore = new UserAppConfigStore(
                configDirectory,
                appConfigStore,
                objectMapper,
                codec);

        Map<String, Object> global = new LinkedHashMap<>();
        global.put("version", 2);
        global.put("locale", "zh-CN");
        appConfigStore.writeAppConfig(global);

        Path userApp = tempDir.resolve(ConfigPaths.userAppConfig(1L));
        Files.createDirectories(userApp.getParent());
        Files.writeString(userApp, "");

        Map<String, Object> restored = userStore.readAppConfig(1L).orElseThrow();
        assertEquals("zh-CN", restored.get("locale"));
        assertTrue(Files.isRegularFile(userApp));
        assertFalse(Files.readString(userApp).isBlank());
        assertTrue(Files.list(userApp.getParent()).anyMatch(path -> path.getFileName().toString().startsWith("app.xml.corrupt-")));
    }
}
