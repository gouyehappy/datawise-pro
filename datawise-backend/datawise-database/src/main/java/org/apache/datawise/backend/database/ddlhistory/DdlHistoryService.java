package org.apache.datawise.backend.database.ddlhistory;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.AtomicFileWrites;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.DdlHistoryEntry;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * MetaForge B1：记录成功执行的表级 DDL，供工作台 DDL 历史查看。
 */
@Service
public class DdlHistoryService {

    private static final Logger log = LoggerFactory.getLogger(DdlHistoryService.class);
    private static final int MAX_ENTRIES_PER_CONNECTION = 200;
    private static final TypeReference<List<DdlHistoryEntry>> LIST_TYPE = new TypeReference<>() {
    };

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;

    public DdlHistoryService(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public void record(
            String connectionId,
            String database,
            String objectName,
            String action,
            String sql,
            Long userId
    ) {
        if (connectionId == null || connectionId.isBlank() || action == null || action.isBlank()) {
            return;
        }
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        DdlHistoryEntry entry = new DdlHistoryEntry(
                IdGenerator.shortId("ddl-"),
                Instant.now(),
                userId,
                connectionId.trim(),
                database != null ? database : "",
                objectName != null ? objectName : "",
                "table",
                action.trim().toUpperCase(),
                truncateSql(sql)
        );
        try {
            Path path = configDirectory.resolve(ConfigPaths.tenantDdlHistory(tenantId, connectionId));
            Files.createDirectories(path.getParent());
            List<DdlHistoryEntry> entries = readEntries(path);
            List<DdlHistoryEntry> next = new ArrayList<>(entries.size() + 1);
            next.add(entry);
            next.addAll(entries);
            if (next.size() > MAX_ENTRIES_PER_CONNECTION) {
                next = new ArrayList<>(next.subList(0, MAX_ENTRIES_PER_CONNECTION));
            }
            byte[] bytes = objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsString(next)
                    .getBytes(StandardCharsets.UTF_8);
            AtomicFileWrites.writeBytes(path, bytes);
        } catch (IOException | RuntimeException ex) {
            ExceptionLogging.recoverable(log, "ddl.history.record failed connectionId=" + connectionId, ex);
        }
    }

    public List<DdlHistoryEntry> list(String connectionId, String database, int limit) {
        if (connectionId == null || connectionId.isBlank()) {
            return List.of();
        }
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        Path path = configDirectory.resolve(ConfigPaths.tenantDdlHistory(tenantId, connectionId));
        List<DdlHistoryEntry> entries = readEntries(path);
        int capped = Math.max(1, Math.min(limit <= 0 ? 50 : limit, MAX_ENTRIES_PER_CONNECTION));
        if (database != null && !database.isBlank()) {
            String db = database.trim();
            entries = entries.stream()
                    .filter(e -> e.database() == null || e.database().isBlank() || db.equalsIgnoreCase(e.database()))
                    .toList();
        }
        if (entries.size() <= capped) {
            return List.copyOf(entries);
        }
        return List.copyOf(entries.subList(0, capped));
    }

    private List<DdlHistoryEntry> readEntries(Path path) {
        if (!Files.isRegularFile(path)) {
            return new ArrayList<>();
        }
        try {
            List<DdlHistoryEntry> entries = objectMapper.readValue(path.toFile(), LIST_TYPE);
            return entries != null ? new ArrayList<>(entries) : new ArrayList<>();
        } catch (IOException ex) {
            ExceptionLogging.recoverable(log, "ddl.history.read failed path=" + path, ex);
            return new ArrayList<>();
        }
    }

    private static String truncateSql(String sql) {
        if (sql == null) {
            return "";
        }
        String trimmed = sql.trim();
        if (trimmed.length() <= 8000) {
            return trimmed;
        }
        return trimmed.substring(0, 8000) + "\n-- … truncated";
    }
}
