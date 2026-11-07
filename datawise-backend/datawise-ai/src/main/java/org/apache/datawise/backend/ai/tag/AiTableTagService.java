package org.apache.datawise.backend.ai.tag;

import org.apache.datawise.backend.common.pack.AiTableTagFilter;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.AiTableTagStore;
import org.apache.datawise.backend.domain.AiTableTagCatalogItemDto;
import org.apache.datawise.backend.domain.UpdateAiTableTagsRequest;
import org.apache.datawise.backend.model.AiTableTagEntry;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class AiTableTagService implements AiTableTagFilter {

    private final AiTableTagStore tableTagStore;
    private final ConnectionVisibilityService connectionVisibilityService;

    public AiTableTagService(
            AiTableTagStore tableTagStore,
            ConnectionVisibilityService connectionVisibilityService
    ) {
        this.tableTagStore = tableTagStore;
        this.connectionVisibilityService = connectionVisibilityService;
    }

    public List<String> listTaggedTableNames(String connectionId, String database) {
        return tableTagStore.listScoped(connectionId, database).stream()
                .map(AiTableTagEntry::getTableName)
                .filter(name -> name != null && !name.isBlank())
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
    }

    public List<AiTableTagCatalogItemDto> listCatalog() {
        Map<String, ConnectionEntity> connections = new LinkedHashMap<>();
        for (ConnectionEntity connection : connectionVisibilityService.visibleCatalogForCurrentUser().connections()) {
            if (connection.getId() != null && !connection.getId().isBlank()) {
                connections.put(connection.getId(), connection);
            }
        }

        // Drop tags for deleted connections so Agent scope / ai-table-tags.json stay consistent.
        tableTagStore.pruneMissingConnections(connections.keySet());

        return tableTagStore.listAll().stream()
                .filter(entry -> entry.getConnectionId() != null && !entry.getConnectionId().isBlank())
                .filter(entry -> entry.getDatabase() != null && !entry.getDatabase().isBlank())
                .filter(entry -> entry.getTableName() != null && !entry.getTableName().isBlank())
                .filter(entry -> connections.containsKey(entry.getConnectionId()))
                .map(entry -> {
                    ConnectionEntity connection = connections.get(entry.getConnectionId());
                    return new AiTableTagCatalogItemDto(
                            entry.getConnectionId(),
                            connection.getName(),
                            entry.getDatabase(),
                            entry.getTableName()
                    );
                })
                .sorted(Comparator
                        .comparing(AiTableTagCatalogItemDto::connectionName, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(AiTableTagCatalogItemDto::database, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(AiTableTagCatalogItemDto::tableName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    @Override
    public List<String> filterTaggedTables(String connectionId, String database, List<String> candidates) {
        if (candidates == null || candidates.isEmpty()) {
            return List.of();
        }
        Set<String> tagged = new LinkedHashSet<>(listTaggedTableNames(connectionId, database));
        if (tagged.isEmpty()) {
            return List.of();
        }
        List<String> filtered = new ArrayList<>();
        for (String candidate : candidates) {
            if (candidate == null || candidate.isBlank()) {
                continue;
            }
            if (tagged.contains(candidate)) {
                filtered.add(candidate);
            }
        }
        return filtered;
    }

    public List<String> updateTags(UpdateAiTableTagsRequest request) {
        requireScope(request.connectionId(), request.database());
        List<String> tableNames = normalizeTableNames(request.tableNames());
        if (tableNames.isEmpty()) {
            return listTaggedTableNames(request.connectionId(), request.database());
        }
        Instant now = Instant.now();
        if (request.tagged()) {
            for (String tableName : tableNames) {
                AiTableTagEntry entry = new AiTableTagEntry();
                entry.setId(entryId(request.connectionId(), request.database(), tableName));
                entry.setConnectionId(request.connectionId().trim());
                entry.setDatabase(request.database().trim());
                entry.setTableName(tableName);
                entry.setUpdatedAt(now);
                tableTagStore.upsert(entry);
            }
        } else {
            for (String tableName : tableNames) {
                tableTagStore.removeScoped(request.connectionId(), request.database(), tableName);
            }
        }
        return listTaggedTableNames(request.connectionId(), request.database());
    }

    static String entryId(String connectionId, String database, String tableName) {
        return IdGenerator.stableShortId(
                "aitag-",
                connectionId.trim()
                        + "|"
                        + database.trim().toLowerCase(Locale.ROOT)
                        + "|"
                        + tableName.trim().toLowerCase(Locale.ROOT)
        );
    }

    private static List<String> normalizeTableNames(List<String> tableNames) {
        if (tableNames == null || tableNames.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String tableName : tableNames) {
            if (tableName == null) {
                continue;
            }
            String trimmed = tableName.trim();
            if (!trimmed.isEmpty()) {
                unique.add(trimmed);
            }
        }
        return List.copyOf(unique);
    }

    private static void requireScope(String connectionId, String database) {
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (database == null || database.isBlank()) {
            throw new IllegalArgumentException("database is required");
        }
    }
}
