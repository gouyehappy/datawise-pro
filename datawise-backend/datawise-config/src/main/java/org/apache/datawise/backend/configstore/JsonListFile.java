package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.io.ConfigFileLock;
import org.apache.datawise.backend.configstore.io.ConfigFileSupport;
import org.apache.datawise.backend.configstore.io.ConfigPersistence;

import java.util.Collection;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;
import java.util.stream.Stream;

/**
 * 单个 JSON 数组文件的内存镜像：无文件时为空列表，变更后立即写盘。
 */
public class JsonListFile<T> {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final String filename;
    private final TypeReference<List<T>> typeReference;
    /** Volatile swap on reload — readers never observe an empty window mid-reload. */
    private volatile CopyOnWriteArrayList<T> items = new CopyOnWriteArrayList<>();

    public JsonListFile(
                        ConfigDirectoryService configDirectory,
                        ObjectMapper objectMapper,
                        String filename,
                        TypeReference<List<T>> typeReference) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.filename = filename;
        this.typeReference = typeReference;
        reload();
    }

    public synchronized void reload() {
        List<T> loaded = ConfigFileSupport.readList(
                configDirectory.resolve(filename),
                objectMapper,
                typeReference);
        items = new CopyOnWriteArrayList<>(loaded);
    }

    public List<T> snapshot() {
        return List.copyOf(items);
    }

    public Stream<T> stream() {
        return items.stream();
    }

    public synchronized void replaceAll(Collection<T> next) {
        ConfigFileLock.runWithExclusiveLock(configDirectory.resolve(filename), () -> {
            CopyOnWriteArrayList<T> replacement = new CopyOnWriteArrayList<>();
            if (next != null) {
                replacement.addAll(next);
            }
            items = replacement;
            persist();
        });
    }

    public synchronized T upsert(T item, Predicate<T> sameItem) {
        return ConfigFileLock.withExclusiveLock(configDirectory.resolve(filename), () -> {
            // Re-read under the lock so a concurrent writer — another store or another process
            // (desktop + headless CLI share the config directory) — is merged instead of
            // overwritten by a stale in-memory mirror.
            reload();
            items.removeIf(sameItem);
            items.add(item);
            persist();
            return item;
        });
    }

    public synchronized T append(T item) {
        return ConfigFileLock.withExclusiveLock(configDirectory.resolve(filename), () -> {
            reload();
            items.add(item);
            persist();
            return item;
        });
    }

    public synchronized void removeIf(Predicate<T> predicate) {
        ConfigFileLock.runWithExclusiveLock(configDirectory.resolve(filename), () -> {
            reload();
            items.removeIf(predicate);
            persist();
        });
    }

    public synchronized void updateMatching(Predicate<T> scope, java.util.function.Consumer<T> updater) {
        ConfigFileLock.runWithExclusiveLock(configDirectory.resolve(filename), () -> {
            reload();
            boolean changed = false;
            for (T item : items) {
                if (scope.test(item)) {
                    updater.accept(item);
                    changed = true;
                }
            }
            if (changed) {
                persist();
            }
        });
    }

    private void persist() {
        ConfigPersistence.writeJson(configDirectory, objectMapper, filename, items);
    }
}
