package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.support.AiTableMatcher;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiTableMatcherTest {

    private static final List<String> TABLES = List.of(
            "cdp_segment",
            "cdp_tag",
            "cdp_tag_task",
            "cdp_user_tag",
            "permission",
            "role",
            "user"
    );

    @Test
    void pickTablesIncludesTagRelatedTables() {
        List<String> picked = AiTableMatcher.pickTables("???????????", TABLES, 6);
        assertTrue(picked.contains("cdp_tag"));
        assertTrue(picked.contains("cdp_user_tag"));
    }

    @Test
    void pickTablePrefersTagTable() {
        assertEquals("cdp_tag", AiTableMatcher.pickTable("?? tag ????", TABLES));
    }
}
