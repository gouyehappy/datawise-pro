package org.apache.datawise.backend.ai.support.prompt;

import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiSqlPromptTemplatesTest {

    @Test
    void systemPromptRequiresExecutableSelectNotCommentsOnly() {
        String prompt = AiSqlPromptTemplates.renderSystemPrompt(
                new AiSqlSchemaContext("conn", "db", "mysql", List.of("orders"), List.of())
        );

        assertTrue(prompt.contains("MUST contain a real read-only SELECT"));
        assertTrue(prompt.contains("Comments alone are never valid"));
        assertFalse(prompt.contains("return a single SQL line comment explaining"));
    }

    @Test
    void emptySchemaStillRequiresSelectFallback() {
        String prompt = AiSqlPromptTemplates.renderSystemPrompt(
                new AiSqlSchemaContext("conn", "db", "mysql", List.of(), List.of())
        );

        assertTrue(prompt.contains("SELECT 1 AS need_schema"));
        assertTrue(prompt.contains("Never return comments without a SELECT/WITH"));
    }
}
