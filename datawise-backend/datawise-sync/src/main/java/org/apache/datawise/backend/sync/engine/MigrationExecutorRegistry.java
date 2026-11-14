package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.config.TableMigrationProperties;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * MetaForge B3：按 {@code datawise.migration.executor}（默认 {@code builtin}）解析执行器。
 */
@Component
public class MigrationExecutorRegistry {

    private final Map<String, MigrationExecutorProvider> byId;
    private final String defaultExecutorId;

    public MigrationExecutorRegistry(
            List<MigrationExecutorProvider> providers,
            TableMigrationProperties migrationProperties
    ) {
        Map<String, MigrationExecutorProvider> map = new LinkedHashMap<>();
        if (providers != null) {
            for (MigrationExecutorProvider provider : providers) {
                if (provider == null || provider.id() == null || provider.id().isBlank()) {
                    continue;
                }
                String key = normalize(provider.id());
                if (map.containsKey(key)) {
                    throw new IllegalStateException("Duplicate MigrationExecutorProvider id: " + key);
                }
                map.put(key, provider);
            }
        }
        this.byId = Map.copyOf(map);
        String configured = migrationProperties != null ? migrationProperties.getExecutor() : null;
        this.defaultExecutorId = configured != null && !configured.isBlank()
                ? normalize(configured)
                : TableMigrationExecutor.ID;
    }

    public MigrationExecutorProvider requireDefault() {
        return require(defaultExecutorId);
    }

    public MigrationExecutorProvider require(String executorId) {
        String key = executorId == null || executorId.isBlank() ? defaultExecutorId : normalize(executorId);
        MigrationExecutorProvider provider = byId.get(key);
        if (provider == null) {
            throw new IllegalArgumentException(
                    "Unknown migration executor '" + key + "'; available=" + byId.keySet()
            );
        }
        return provider;
    }

    public List<String> listIds() {
        return List.copyOf(byId.keySet());
    }

    public String defaultExecutorId() {
        return defaultExecutorId;
    }

    private static String normalize(String id) {
        return id.trim().toLowerCase(Locale.ROOT);
    }
}
