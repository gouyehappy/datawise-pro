package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiSchemaTablePickerTest {

    @Test
    void pickRelevantTables_prefersEvidenceHintsThenPromptMatch() {
        List<String> tables = List.of("orders", "customers", "products", "tags");
        AiEvidenceBundle evidence = AiEvidenceBundle.builder("sales by region")
                .hintTable("customers")
                .build();

        List<String> picked = AiSchemaTablePicker.pickRelevantTables(
                "show order totals",
                tables,
                evidence
        );

        assertTrue(picked.contains("customers"));
        assertTrue(picked.size() <= AiSchemaLimits.MAX_TABLES);
    }

    @Test
    void resolveTableNames_filtersUnknownAndCapsAtMax() {
        List<String> allTables = List.of("a", "b", "c", "d", "e", "f", "g");
        List<String> requested = List.of("a", "missing", "b");

        List<String> resolved = AiSchemaTablePicker.resolveTableNames(requested, allTables, null);

        assertEquals(List.of("a", "b"), resolved);
    }
}
