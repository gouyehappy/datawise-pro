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
    void allowsReplaceFunctionAndLiteralKeywords() {
        String sql = AiSqlSafetyChecker.requireReadOnlySelect(
                "SELECT REPLACE(name, 'delete', 'x') AS call, exec AS exec_col FROM t WHERE note = 'please update'"
        );
        assertTrue(sql.toUpperCase().contains("REPLACE"));
    }

    @Test
    void allowsSelectWithCallColumnName() {
        String sql = AiSqlSafetyChecker.requireReadOnlySelect("SELECT call, exec FROM procedures");
        assertTrue(sql.toLowerCase().contains("call"));
    }

    @Test
    void rejectsDestructiveSql() {
        assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect("DELETE FROM user")
        );
    }

    @Test
    void rejectsWithCteFollowedByDelete() {
        assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect(
                        "WITH doomed AS (SELECT 1 AS id) DELETE FROM user WHERE id IN (SELECT id FROM doomed)"
                )
        );
    }

    @Test
    void rejectsSelectIntoOutfile() {
        assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect("SELECT * FROM t INTO OUTFILE '/tmp/x'")
        );
    }

    @Test
    void rejectsSelectForUpdate() {
        assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect("SELECT * FROM t FOR UPDATE")
        );
    }

    @Test
    void rejectsReplaceInto() {
        assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect("REPLACE INTO t (id) VALUES (1)")
        );
    }

    @Test
    void rejectsCommentOnlyReply() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect("-- AI: cannot fix\n-- schema missing")
        );
        assertTrue(ex.getMessage().contains("empty"));
    }

    @Test
    void stripStringLiteralsRemovesQuotedKeywords() {
        String scanned = AiSqlSafetyChecker.stripStringLiterals(
                "SELECT * FROM t WHERE msg = 'DELETE FROM x' AND note = \"UPDATE\""
        );
        assertFalse(scanned.contains("DELETE FROM x"));
        assertTrue(scanned.contains("''"));
    }
}
