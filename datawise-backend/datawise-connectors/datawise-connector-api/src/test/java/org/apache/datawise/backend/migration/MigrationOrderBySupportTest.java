package org.apache.datawise.backend.migration;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MigrationOrderBySupportTest {

    @Test
    void resolveOrderByColumnsPrefersExplicitThenPrimaryKey() {
        List<String> resolved = MigrationOrderBySupport.resolveOrderByColumns(
                List.of("updated_at"),
                List.of("id"),
                null,
                "FULL_APPEND");
        assertEquals(List.of("updated_at"), resolved);
    }

    @Test
    void resolveOrderByColumnsFallsBackToPrimaryKey() {
        List<String> resolved = MigrationOrderBySupport.resolveOrderByColumns(
                List.of(),
                List.of("id", "tenant_id"),
                null,
                "FULL_APPEND");
        assertEquals(List.of("id", "tenant_id"), resolved);
    }

    @Test
    void resolveOrderByColumnsPutsWatermarkFirstForIncrAppend() {
        List<String> resolved = MigrationOrderBySupport.resolveOrderByColumns(
                List.of("id"),
                List.of("id"),
                "updated_at",
                "INCR_APPEND");
        assertEquals(List.of("updated_at", "id"), resolved);
    }

    @Test
    void buildExecutionSqlAddsOrderByForFullAppend() {
        String sql = MigrationOrderBySupport.buildExecutionSql(
                "SELECT * FROM t",
                "FULL_APPEND",
                null,
                null,
                List.of("id", "updated_at"));
        assertEquals("SELECT * FROM t ORDER BY id ASC, updated_at ASC", sql);
    }

    @Test
    void buildExecutionSqlAddsWatermarkFilterAndCompositeOrderBy() {
        String signature = MigrationOrderBySupport.buildSignatureSql(
                "SELECT * FROM t",
                null,
                "INCR_APPEND",
                "updated_at",
                List.of("updated_at", "id"));
        String sql = MigrationOrderBySupport.buildExecutionSql(
                signature,
                "INCR_APPEND",
                "updated_at",
                "2026-01-01 00:00:00",
                List.of("updated_at", "id"));
        assertTrue(sql.contains("updated_at > '2026-01-01 00:00:00'"));
        assertTrue(sql.contains("ORDER BY updated_at ASC, id ASC"));
        assertTrue(signature.contains("/*INCR_APPEND watermark=updated_at ORDER BY=updated_at,id*/"));
    }

    @Test
    void appendKeysetSeek_buildsCompositePredicateBeforeOrderBy() {
        String sql = MigrationOrderBySupport.appendKeysetSeek(
                "SELECT * FROM t ORDER BY id ASC, tenant_id ASC",
                List.of("id", "tenant_id"),
                List.of("10", "acme"));
        assertTrue(sql.contains("WHERE"));
        assertTrue(sql.contains("id = 10 AND tenant_id > 'acme'"));
        assertTrue(sql.endsWith("ORDER BY id ASC, tenant_id ASC"));
    }

    @Test
    void encodeDecodeSeekKey_roundTrip() {
        List<String> values = List.of("10", "acme", "2026-01-01");
        String encoded = MigrationOrderBySupport.encodeSeekKey(values);
        assertEquals(values, MigrationOrderBySupport.decodeSeekKey(encoded));
    }

    @Test
    void extractSeekKey_readsLastRowValues() {
        List<String> key = MigrationOrderBySupport.extractSeekKey(
                List.of(Map.of("id", 1, "tenant_id", "a"), Map.of("id", 2, "tenant_id", "b")),
                List.of("id", "tenant_id"));
        assertEquals(List.of("2", "b"), key);
    }

    @Test
    void extractSeekKey_resolvesJdbcStorageKeysFromColumnMeta() {
        List<Map<String, Object>> columnMeta = List.of(
                Map.of("key", "c1", "name", "tenant_id", "type", "VARCHAR"),
                Map.of("key", "c2", "name", "cdis_id", "type", "BIGINT"));
        List<String> key = MigrationOrderBySupport.extractSeekKey(
                List.of(Map.of("c1", "a025", "c2", 99123L)),
                List.of("tenant_id", "cdis_id"),
                columnMeta);
        assertEquals(List.of("a025", "99123"), key);
    }

    @Test
    void validateOrderByColumnsRejectsInvalidNames() {
        assertThrows(IllegalArgumentException.class, () -> MigrationOrderBySupport.validateOrderByColumns(List.of("id;drop")));
    }
}
