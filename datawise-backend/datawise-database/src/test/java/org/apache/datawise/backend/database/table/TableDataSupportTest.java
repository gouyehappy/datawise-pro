package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TableDataSupportTest {

    @Test
    void normalizeInsertValues_skipsAutoIncrementAndBlankNonNullable() {
        TablePropertiesResult properties = new TablePropertiesResult(
                "users",
                null,
                null,
                null,
                null,
                null,
                List.of(
                        column(1, "id", "PRI", true, false),
                        column(2, "name", "", false, false),
                        column(3, "note", "", false, true)
                ),
                List.of(),
                List.of()
        );

        Map<String, Object> normalized = TableDataSupport.normalizeInsertValues(
                properties,
                Map.of("id", "", "name", "alice", "note", "")
        );

        assertFalse(normalized.containsKey("id"));
        assertEquals("alice", normalized.get("name"));
        assertTrue(normalized.containsKey("note"));
        assertEquals(null, normalized.get("note"));
    }

    private static TableColumnDetail column(
            int ordinal,
            String name,
            String keyType,
            boolean autoIncrement,
            boolean nullable
    ) {
        return new TableColumnDetail(
                ordinal,
                name,
                "varchar",
                nullable,
                autoIncrement,
                keyType,
                null,
                null,
                null
        );
    }
}
