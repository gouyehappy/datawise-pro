package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiSchemaTablePickerTest {

    @Test
    void pickRelevantTablesRanksPromptHitsAboveListOrder() {
        List<String> tables = List.of("aaa_unrelated", "zzz_orders", "bbb_users");
        List<String> picked = AiSchemaTablePicker.pickRelevantTables("show me orders for users", tables, null);
        assertTrue(picked.contains("zzz_orders"));
        assertTrue(picked.contains("bbb_users"));
        assertEquals("zzz_orders", picked.get(0));
    }

    @Test
    void evidenceHintsBoostTables() {
        AiEvidenceBundle evidence = new AiEvidenceBundle("hello", List.of(), List.of("bbb_users"), List.of());
        List<String> tables = List.of("aaa_unrelated", "bbb_users");
        List<String> picked = AiSchemaTablePicker.pickRelevantTables("hello", tables, evidence);
        assertEquals("bbb_users", picked.get(0));
    }
}
