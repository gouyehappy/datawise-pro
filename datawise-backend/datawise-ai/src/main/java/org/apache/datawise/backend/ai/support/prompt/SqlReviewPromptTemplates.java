package org.apache.datawise.backend.ai.support.prompt;

import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.domain.SqlReviewFindingDto;

import java.util.ArrayList;
import java.util.List;

public final class SqlReviewPromptTemplates {

    private SqlReviewPromptTemplates() {
    }

    public static String renderRewriteSystemPrompt(AiSqlSchemaContext schema) {
        List<String> lines = new ArrayList<>(List.of(
                "You are a SQL safety reviewer for DataWise.",
                "Rewrite the user's SQL to address ALL review findings while preserving intent.",
                "Return only executable SQL without markdown fences or explanation.",
                "Always include a real SELECT/WITH statement; comments alone are invalid.",
                "Optional first line: -- AI rewrite: <short reason>"
        ));
        if (schema != null && schema.dbType() != null && !schema.dbType().isBlank()) {
            lines.add("Database engine: " + schema.dbType());
        }
        if (schema != null && schema.tables() != null && !schema.tables().isEmpty()) {
            lines.add("Available tables: " + String.join(", ", schema.tables()));
        }
        return String.join("\n", lines);
    }

    public static String renderRewriteUserPrompt(String sql, List<SqlReviewFindingDto> findings) {
        List<String> lines = new ArrayList<>();
        lines.add("Original SQL:");
        lines.add(sql != null ? sql : "");
        lines.add("");
        lines.add("Review findings to fix:");
        if (findings != null) {
            for (SqlReviewFindingDto finding : findings) {
                lines.add("- [" + finding.severity() + "/" + finding.code() + "] "
                        + finding.message()
                        + (finding.suggestion() != null && !finding.suggestion().isBlank()
                        ? " → " + finding.suggestion() : ""));
            }
        }
        lines.add("");
        lines.add("Regenerate safer SQL that resolves every finding.");
        lines.add("For DELETE/UPDATE without WHERE, add a restrictive WHERE (e.g. primary key predicate) — never omit WHERE.");
        lines.add("For SELECT *, list explicit columns when schema is known.");
        lines.add("For full-table scans, add WHERE filters or LIMIT.");
        return String.join("\n", lines);
    }
}
