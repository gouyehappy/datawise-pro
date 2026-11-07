package org.apache.datawise.backend.connector.mysql.dml;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

class MysqlFamilyDmlDialectUpsertTest {

    private final MysqlFamilyDmlDialect dialect = new MysqlFamilyDmlDialect();

    @Test
    void overwriteUsesOnDuplicateKeyUpdate() {
        String sql = dialect.buildMultiUpsert(
                "shop",
                "users",
                List.of(Map.of("name", "id", "key", "id"), Map.of("name", "name", "key", "name")),
                List.of(Map.of("id", 1, "name", "a")),
                List.of("id"),
                "OVERWRITE"
        );
        assertTrue(sql.contains("ON DUPLICATE KEY UPDATE"));
        assertTrue(sql.contains("`name` = VALUES(`name`)"));
    }

    @Test
    void skipUsesInsertIgnore() {
        String sql = dialect.buildMultiUpsert(
                "shop",
                "users",
                List.of(Map.of("name", "id", "key", "id"), Map.of("name", "name", "key", "name")),
                List.of(Map.of("id", 1, "name", "a")),
                List.of("id"),
                "SKIP"
        );
        assertTrue(sql.startsWith("INSERT IGNORE INTO"));
    }
}
