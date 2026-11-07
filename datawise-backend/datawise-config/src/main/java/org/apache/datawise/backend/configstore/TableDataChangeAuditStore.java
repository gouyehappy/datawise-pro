package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.PathSegmentSanitizer;
import org.apache.datawise.backend.domain.TableDataChangeAuditEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TableDataChangeAuditStore {

    private static final int MAX_ENTRIES_PER_SCOPE = 200;

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final UserResourcePolicy resourcePolicy;
    private final ConcurrentHashMap<String, JsonListFile<TableDataChangeAuditEntry>> cache = new ConcurrentHashMap<>();

    public TableDataChangeAuditStore(
                                     ConfigDirectoryService configDirectory,
                                     ObjectMapper objectMapper,
                                     UserResourcePolicy resourcePolicy) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.resourcePolicy = resourcePolicy;
    }

    public List<TableDataChangeAuditEntry> list(
                                                long userId,
                                                String connectionId,
                                                String database,
                                                String tableName,
                                                int limit) {
        int capped = Math.max(1, Math.min(limit, MAX_ENTRIES_PER_SCOPE));
        return entriesFor(userId, scopeKey(connectionId, database, tableName)).snapshot().stream()
                .sorted(Comparator.comparingLong(TableDataChangeAuditEntry::createdAtMs).reversed())
                .limit(capped)
                .toList();
    }

    public TableDataChangeAuditEntry append(
                                            long userId,
                                            String connectionId,
                                            String database,
                                            String tableName,
                                            TableDataChangeAuditEntry entry) {
        resourcePolicy.requireWrite(UserResource.TABLE_DATA_AUDIT);
        JsonListFile<TableDataChangeAuditEntry> file = entriesFor(userId, scopeKey(connectionId, database, tableName));
        synchronized (file) {
            List<TableDataChangeAuditEntry> next = new ArrayList<>(file.snapshot());
            next.add(entry);
            if (next.size() > MAX_ENTRIES_PER_SCOPE) {
                next = next.subList(next.size() - MAX_ENTRIES_PER_SCOPE, next.size());
            }
            file.replaceAll(next);
        }
        return entry;
    }

    public TableDataChangeAuditEntry find(
                                          long userId,
                                          String connectionId,
                                          String database,
                                          String tableName,
                                          String entryId) {
        return entriesFor(userId, scopeKey(connectionId, database, tableName)).snapshot().stream()
                .filter(entry -> entryId.equals(entry.id()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Audit entry not found: " + entryId));
    }

    public void markReverted(
                             long userId,
                             String connectionId,
                             String database,
                             String tableName,
                             String entryId) {
        resourcePolicy.requireWrite(UserResource.TABLE_DATA_AUDIT);
        JsonListFile<TableDataChangeAuditEntry> file = entriesFor(userId, scopeKey(connectionId, database, tableName));
        synchronized (file) {
            List<TableDataChangeAuditEntry> next = new ArrayList<>();
            for (TableDataChangeAuditEntry entry : file.snapshot()) {
                if (entryId.equals(entry.id())) {
                    next.add(new TableDataChangeAuditEntry(
                            entry.id(),
                            entry.createdAtMs(),
                            entry.operation(),
                            entry.beforeRow(),
                            entry.afterRow(),
                            entry.primaryKey(),
                            true,
                            entry.restoredFromId()));
                } else {
                    next.add(entry);
                }
            }
            file.replaceAll(next);
        }
    }

    static String scopeKey(String connectionId, String database, String tableName) {
        String safeConnection = sanitizeScopeSegment(connectionId, "conn");
        String safeDatabase = sanitizeScopeSegment(database, "db");
        String safeTable = sanitizeScopeSegment(tableName, "table");
        return safeConnection + "__" + safeDatabase + "__" + safeTable;
    }

    private static String sanitizeScopeSegment(String value, String fallback) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            return fallback;
        }
        String sanitized = PathSegmentSanitizer.sanitizeFileName(trimmed, fallback);
        return sanitized.toLowerCase(Locale.ROOT);
    }

    private JsonListFile<TableDataChangeAuditEntry> entriesFor(long userId, String scopeKey) {
        String cacheKey = TenantScopedConfigSupport.cacheKey(userId) + ":" + scopeKey;
        return cache.computeIfAbsent(cacheKey, ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                TenantScopedConfigSupport.ensureUserTenantScopeFile(configDirectory, userId, "table-data-audit", scopeKey),
                new TypeReference<>() {
                }));
    }
}
