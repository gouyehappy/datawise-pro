package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.config.ObjectStorageProperties;
import org.apache.datawise.backend.storage.ObjectStorageException;
import org.apache.datawise.backend.storage.ObjectStorageKey;
import org.apache.datawise.backend.storage.ObjectStorageProvider;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * MetaForge A3：SQL 导出可选落地到 {@link ObjectStorageProvider}
 *（{@code datawise.object-storage.publish-exports=true}）。
 */
@Component
public class TableSqlExportObjectStoragePublisher {

    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    private final ObjectStorageProvider storage;
    private final ObjectStorageProperties properties;

    public TableSqlExportObjectStoragePublisher(
            ObjectStorageProvider storage,
            ObjectStorageProperties properties
    ) {
        this.storage = storage;
        this.properties = properties;
    }

    public PublishResult publishIfEnabled(
            String sql,
            String fileName,
            String connectionId,
            String database
    ) throws ObjectStorageException {
        if (!properties.isPublishExports()) {
            return PublishResult.none();
        }
        if (sql == null) {
            sql = "";
        }
        String safeFile = fileName == null || fileName.isBlank() ? "export.sql" : fileName.trim();
        String objectKey = join(
                properties.getExportKeyPrefix(),
                sanitize(connectionId),
                sanitize(database),
                STAMP.format(Instant.now()) + "-" + safeFile
        );
        ObjectStorageKey key = ObjectStorageKey.of(objectKey);
        byte[] bytes = sql.getBytes(StandardCharsets.UTF_8);
        storage.put(key, new ByteArrayInputStream(bytes), bytes.length, "application/sql");
        String uri = storage.presignGet(key, Duration.ofHours(1)).toString();
        return new PublishResult(objectKey, uri);
    }

    static String join(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part == null || part.isBlank()) {
                continue;
            }
            String trimmed = part.trim().replace('\\', '/').replaceAll("^/+|/+$", "");
            if (trimmed.isEmpty()) {
                continue;
            }
            if (!sb.isEmpty()) {
                sb.append('/');
            }
            sb.append(trimmed);
        }
        return sb.toString();
    }

    private static String sanitize(String value) {
        if (value == null || value.isBlank()) {
            return "_";
        }
        String safe = value.trim().replaceAll("[\\\\/:*?\"<>|\\s]+", "_");
        return safe.isBlank() ? "_" : safe;
    }

    public record PublishResult(String objectStorageKey, String objectStorageUri) {
        static PublishResult none() {
            return new PublishResult(null, null);
        }
    }
}
