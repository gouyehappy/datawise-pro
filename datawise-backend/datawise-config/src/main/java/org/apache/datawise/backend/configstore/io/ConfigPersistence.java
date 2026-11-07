package org.apache.datawise.backend.configstore.io;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;

import java.io.IOException;

/**
 * 将内存数据持久化到 config 目录的通用入口。
 */
public final class ConfigPersistence {

    private ConfigPersistence() {
    }

    public static void writeJson(
                                 ConfigDirectoryService configDirectory,
                                 ObjectMapper objectMapper,
                                 String filename,
                                 Object payload) {
        try {
            configDirectory.ensureExists();
            ConfigFileSupport.writeJson(configDirectory.resolve(filename), objectMapper, payload);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to persist " + filename, ex);
        }
    }
}
