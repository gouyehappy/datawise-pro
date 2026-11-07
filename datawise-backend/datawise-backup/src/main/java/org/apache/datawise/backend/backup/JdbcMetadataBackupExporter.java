package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.configstore.jdbc.MetadataJdbcConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Clob;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Exports identity metadata tables to staging {@code metadata/{table}.json}
 * using the METADATA_JDBC {@link JdbcTemplate}.
 */
@Component
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcMetadataBackupExporter {

    private static final Logger log = LoggerFactory.getLogger(JdbcMetadataBackupExporter.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public JdbcMetadataBackupExporter(
            @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
            ObjectMapper objectMapper
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper.copy()
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    /**
     * Writes table dumps under {@code stagingDir/metadata/} and returns relative paths included.
     */
    public List<String> exportTo(Path stagingDir, BackupPolicy policy) throws IOException {
        Path metadataDir = stagingDir.resolve(JdbcMetadataBackupTables.METADATA_DIR);
        Files.createDirectories(metadataDir);

        List<String> tables = new ArrayList<>(JdbcMetadataBackupTables.CORE_TABLES);
        if (policy == null || policy.isIncludeSqlHistory()) {
            tables.add(JdbcMetadataBackupTables.SQL_HISTORY);
        }

        List<String> relativePaths = new ArrayList<>();
        for (String table : tables) {
            List<Map<String, Object>> rows = dumpTable(table);
            Path target = stagingDir.resolve(JdbcMetadataBackupTables.relativePath(table));
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(target.toFile(), rows);
            relativePaths.add(JdbcMetadataBackupTables.relativePath(table));
            log.debug("Exported metadata table {} ({} rows)", table, rows.size());
        }
        return relativePaths;
    }

    List<Map<String, Object>> dumpTable(String table) {
        return jdbc.query("SELECT * FROM " + table, (ResultSet rs) -> {
            List<Map<String, Object>> rows = new ArrayList<>();
            ResultSetMetaData meta = rs.getMetaData();
            int columnCount = meta.getColumnCount();
            while (rs.next()) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (int i = 1; i <= columnCount; i++) {
                    String label = meta.getColumnLabel(i);
                    if (label == null || label.isBlank()) {
                        label = meta.getColumnName(i);
                    }
                    row.put(label.toLowerCase(), normalizeValue(rs.getObject(i)));
                }
                rows.add(row);
            }
            return rows;
        });
    }

    private static Object normalizeValue(Object value) throws SQLException {
        if (value == null) {
            return null;
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant().toString();
        }
        if (value instanceof java.sql.Date date) {
            return date.toLocalDate().toString();
        }
        if (value instanceof java.sql.Time time) {
            return time.toLocalTime().toString();
        }
        if (value instanceof Instant instant) {
            return instant.toString();
        }
        if (value instanceof Clob clob) {
            long length = clob.length();
            if (length <= 0) {
                return "";
            }
            if (length > Integer.MAX_VALUE) {
                throw new SQLException("CLOB too large to export");
            }
            return clob.getSubString(1, (int) length);
        }
        if (value instanceof byte[] bytes) {
            return new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        }
        return value;
    }
}
