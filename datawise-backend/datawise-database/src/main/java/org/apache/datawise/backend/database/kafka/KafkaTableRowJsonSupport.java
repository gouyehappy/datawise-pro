package org.apache.datawise.backend.database.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Serializes table rows to Kafka JSON message bodies and optional keys. */
final class KafkaTableRowJsonSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();

    private KafkaTableRowJsonSupport() {
    }

    static String toJson(Map<String, Object> row, List<Map<String, Object>> columns) {
        try {
            return MAPPER.writeValueAsString(normalizeRow(toNamedRow(row, columns)));
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Failed to serialize row to JSON", ex);
        }
    }

    static String resolveKey(
            Map<String, Object> row,
            String keyColumn,
            List<Map<String, Object>> columns
    ) {
        if (keyColumn == null || keyColumn.isBlank() || row == null || row.isEmpty()) {
            return null;
        }
        Map<String, Object> namedRow = toNamedRow(row, columns);
        String trimmed = keyColumn.trim();
        if (namedRow.containsKey(trimmed)) {
            return stringify(namedRow.get(trimmed));
        }
        for (Map.Entry<String, Object> entry : namedRow.entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(trimmed)) {
                return stringify(entry.getValue());
            }
        }
        return null;
    }

    static Map<String, Object> toNamedRow(Map<String, Object> row, List<Map<String, Object>> columns) {
        if (row == null || row.isEmpty()) {
            return Map.of();
        }
        if (columns == null || columns.isEmpty()) {
            return row;
        }
        Map<String, Object> named = new LinkedHashMap<>();
        for (Map<String, Object> column : columns) {
            Object nameObj = column.get("name");
            Object keyObj = column.get("key");
            if (nameObj == null || keyObj == null) {
                continue;
            }
            String rowKey = String.valueOf(keyObj);
            if (!row.containsKey(rowKey)) {
                continue;
            }
            named.put(String.valueOf(nameObj), row.get(rowKey));
        }
        if (!named.isEmpty()) {
            return named;
        }
        return row;
    }

    private static Map<String, Object> normalizeRow(Map<String, Object> row) {
        if (row == null || row.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> normalized = new LinkedHashMap<>();
        row.forEach((key, value) -> normalized.put(key, normalizeValue(value)));
        return normalized;
    }

    private static Object normalizeValue(Object value) {
        if (value instanceof byte[] bytes) {
            return java.util.Base64.getEncoder().encodeToString(bytes);
        }
        return value;
    }

    private static String stringify(Object value) {
        if (value == null) {
            return null;
        }
        return String.valueOf(value);
    }
}
