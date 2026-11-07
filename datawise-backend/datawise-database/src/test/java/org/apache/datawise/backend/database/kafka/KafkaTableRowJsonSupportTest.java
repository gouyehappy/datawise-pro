package org.apache.datawise.backend.database.kafka;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KafkaTableRowJsonSupportTest {

    private static List<Map<String, Object>> sampleColumns() {
        return List.of(
                Map.of("key", "c1", "name", "id"),
                Map.of("key", "c2", "name", "name")
        );
    }

    @Test
    void toJson_serializesRowMap() {
        String json = KafkaTableRowJsonSupport.toJson(Map.of("id", 1, "name", "alice"), List.of());
        assertTrue(json.contains("\"id\":1"));
        assertTrue(json.contains("\"name\":\"alice\""));
    }

    @Test
    void toJson_usesColumnNamesInsteadOfInternalKeys() {
        String json = KafkaTableRowJsonSupport.toJson(
                Map.of("c1", 1, "c2", "alice"),
                sampleColumns()
        );
        assertTrue(json.contains("\"id\":1"));
        assertTrue(json.contains("\"name\":\"alice\""));
        assertTrue(!json.contains("\"c1\""));
    }

    @Test
    void resolveKey_usesColumnCaseInsensitive() {
        String key = KafkaTableRowJsonSupport.resolveKey(
                Map.of("c1", 42),
                "userid",
                List.of(Map.of("key", "c1", "name", "UserId"))
        );
        assertEquals("42", key);
    }

    @Test
    void resolveKey_returnsNullWhenMissing() {
        assertNull(KafkaTableRowJsonSupport.resolveKey(
                Map.of("c1", 1),
                "missing",
                List.of(Map.of("key", "c1", "name", "id"))
        ));
    }
}
