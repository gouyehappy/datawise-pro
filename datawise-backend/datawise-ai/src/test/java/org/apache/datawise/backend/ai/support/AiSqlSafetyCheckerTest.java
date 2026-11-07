package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiSqlSafetyCheckerTest {

    @Test
    void keepsSingleSelectWithAiComment() {
        String sql = AiSqlSafetyChecker.requireReadOnlySelect("-- AI: test\nSELECT 1");
        assertTrue(sql.contains("SELECT 1"));
        assertFalse(sql.contains("SELECT 2"));
    }

    @Test
    void keepsOnlyFirstStatementWhenLlmReturnsMultipleSelects() {
        String raw = """
                -- AI: tag analysis
                SELECT tag, name FROM tags LIMIT 10;
                
                SELECT
                    category,
                    COUNT(*) AS tag_count
                FROM tags
                GROUP BY category;
                """;

        String sql = AiSqlSafetyChecker.requireReadOnlySelect(raw);

        assertTrue(sql.contains("SELECT tag, name FROM tags LIMIT 10"));
        assertFalse(sql.toLowerCase().contains("tag_count"));
    }

    @Test
    void stripsMarkdownFenceAndLeadingProse() {
        String raw = """
                Here is the query:
                ```sql
                -- AI: sales
                SELECT amount FROM orders;
                SELECT 2;
                ```
                """;

        String sql = AiSqlSafetyChecker.requireReadOnlySelect(raw);

        assertEquals("-- AI: sales\nSELECT amount FROM orders", sql);
    }

    @Test
    void rejectsDestructiveSql() {
        assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect("DELETE FROM user")
        );
    }

    @Test
    void rejectsCommentOnlyReply() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect("-- AI: cannot fix\n-- schema missing")
        );
        assertTrue(ex.getMessage().contains("empty"));
    }
}
