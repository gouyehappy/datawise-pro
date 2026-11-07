package org.apache.datawise.backend.configstore.io;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;

import java.io.IOException;
import java.nio.file.Path;

/**
 * 单个 JSON 对象文件的内存镜像：无文件时回退 emptyValue，变更后立即写盘。
 */
public final class JsonSnapshotFile<T> {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final String filename;
    private final Class<T> type;
    private final T emptyValue;
    private T value;

    public JsonSnapshotFile(
                            ConfigDirectoryService configDirectory,
                            ObjectMapper objectMapper,
                            String filename,
                            Class<T> type,
                            T emptyValue) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.filename = filename;
        this.type = type;
        this.emptyValue = emptyValue;
        reload();
    }

    public void reload() {
        value = ConfigFileSupport.readObject(
                resolvePath(),
                objectMapper,
                type,
                emptyValue);
    }

    public T get() {
        return value;
    }

    public synchronized void replace(T next) {
        value = next != null ? next : emptyValue;
        persist();
    }

    public synchronized void update(java.util.function.UnaryOperator<T> updater) {
        value = updater.apply(value != null ? value : emptyValue);
        persist();
    }

    private void persist() {
        ConfigPersistence.writeJson(configDirectory, objectMapper, filename, value);
    }

    private Path resolvePath() {
        return configDirectory.resolve(filename);
    }
}
