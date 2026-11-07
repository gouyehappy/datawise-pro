package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AiPromptTemplatesExecutionRetryTest {

    @Test
    void retryPromptIncludesErrorAndFailedSql() {
        String prompt = AiPromptTemplates.renderSqlExecutionRetryUserPrompt(
                "analyze tags",
                null,
                "SELECT c.name FROM cdp_tag c",
                "Unknown column 'c.name' in 'field list'",
                1
        );

        assertTrue(prompt.contains("analyze tags"));
        assertTrue(prompt.contains("SELECT c.name FROM cdp_tag c"));
        assertTrue(prompt.contains("Unknown column 'c.name'"));
        assertTrue(prompt.contains("Error near SQL line: 1"));
        assertTrue(prompt.contains("read-only SELECT"));
        assertTrue(prompt.contains("runnable SQL") || prompt.contains("executable"));
        assertTrue(prompt.contains("comments") || prompt.contains("Do not reply with comments"));
    }
}
