package org.apache.datawise.backend.ai.support.prompt;

import org.apache.datawise.backend.ai.schema.AiSemanticMetricHint;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.schema.AiTableDdlSnippet;
import org.apache.datawise.backend.ai.schema.AiTableRelationHint;
import org.apache.datawise.backend.ai.domain.AiAnalysisContextDto;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;

import java.util.ArrayList;
import java.util.List;

public final class AiSqlPromptTemplates {

    private AiSqlPromptTemplates() {
    }

    public static String renderSystemPrompt(AiSqlSchemaContext context) {
        return renderSystemPrompt(context, null);
    }

    public static String renderSystemPrompt(AiSqlSchemaContext context, AiEvidenceBundle evidence) {
        List<String> lines = new ArrayList<>(List.of(
                "You are a SQL expert for DataWise.",
                "Return only executable SQL without markdown fences or explanation.",
                "The reply MUST contain a real read-only SELECT or WITH statement that can be executed.",
                "Comments alone are never valid. Do not answer with only -- comments or prose.",
                "Optional: start with a single-line comment summarizing the request, e.g. -- AI: <request>, then the SELECT/WITH."
        ));

        appendEvidence(lines, evidence);

        if (context.connectionLabel() != null && !context.connectionLabel().isBlank()) {
            lines.add("Connection: " + context.connectionLabel());
        }
        if (context.database() != null && !context.database().isBlank()) {
            lines.add("Current database: " + context.database());
        }
        if (context.dbType() != null && !context.dbType().isBlank()) {
            lines.add("Database engine: " + context.dbType());
        }

        if (context.tables() != null && !context.tables().isEmpty()) {
            lines.add("You MUST only use table names from the following list.");
            lines.add("Do not invent tables or assume common names like tags, users, or articles unless they appear below:");
            lines.add(String.join(", ", context.tables()));
        } else {
            lines.add("No table list is available for the current database.");
            lines.add("Still return an executable read-only SELECT (for example SELECT 1 AS need_schema)");
            lines.add("with a short -- AI: comment explaining that schema/table list is required.");
            lines.add("Never return comments without a SELECT/WITH.");
        }

        if (context.tableDdls() != null && !context.tableDdls().isEmpty()) {
            lines.add("Use ONLY column names that appear in the DDL snippets below. Do not invent columns like name, title, or status unless they exist in DDL:");
            for (AiTableDdlSnippet snippet : context.tableDdls()) {
                lines.add("-- DDL: " + snippet.table());
                lines.add(snippet.ddl());
            }
        }

        if (context.tableRelations() != null && !context.tableRelations().isEmpty()) {
            lines.add("Known foreign-key relationships (use for JOINs when needed):");
            for (AiTableRelationHint relation : context.tableRelations()) {
                lines.add("-- FK: " + relation.describe());
            }
        }

        if (context.semanticMetrics() != null && !context.semanticMetrics().isEmpty()) {
            lines.add("Business metrics (semantic layer — prefer these definitions when the user asks for KPIs):");
            for (AiSemanticMetricHint metric : context.semanticMetrics()) {
                if (metric.name() == null || metric.name().isBlank()) {
                    continue;
                }
                StringBuilder line = new StringBuilder("- ").append(metric.name());
                if (metric.expression() != null && !metric.expression().isBlank()) {
                    line.append(" = ").append(metric.expression());
                }
                if (metric.description() != null && !metric.description().isBlank()) {
                    line.append(" (").append(metric.description()).append(")");
                }
                if (metric.unit() != null && !metric.unit().isBlank()) {
                    line.append(" [").append(metric.unit()).append("]");
                }
                lines.add(line.toString());
            }
        }

        return String.join("\n", lines);
    }

    public static String renderAnalysisSqlUserPrompt(String prompt, AiAnalysisContextDto context) {
        if (context == null || context.previousSql() == null || context.previousSql().isBlank()) {
            return prompt;
        }
        List<String> lines = new ArrayList<>();
        lines.add("Previous analysis SQL:");
        lines.add(context.previousSql());
        if (context.previousSummary() != null && !context.previousSummary().isBlank()) {
            lines.add("Previous summary: " + context.previousSummary());
        }
        if (context.previousChartType() != null && !context.previousChartType().isBlank()) {
            lines.add("Previous chart type: " + context.previousChartType());
        }
        lines.add("User follow-up request:");
        lines.add(prompt);
        lines.add("Revise the SQL to satisfy the follow-up.");
        lines.add("Return executable read-only SELECT/WITH only (optional one-line -- AI: comment first).");
        lines.add("Never return comments or explanations without SQL.");
        return String.join("\n", lines);
    }

    public static String renderValidationRetryUserPrompt(
            String prompt,
            AiAnalysisContextDto context,
            String failedSql,
            String validationError
    ) {
        List<String> lines = new ArrayList<>();
        lines.add("User request:");
        lines.add(prompt != null ? prompt : "");
        if (context != null && context.previousSql() != null && !context.previousSql().isBlank()) {
            lines.add("");
            lines.add("Previous analysis SQL (for context):");
            lines.add(context.previousSql());
        }
        lines.add("");
        lines.add("The following SQL failed read-only / semantic validation:");
        lines.add(failedSql != null ? failedSql : "");
        lines.add("");
        lines.add("Validation error:");
        lines.add(validationError != null ? validationError : "unknown error");
        lines.add("");
        lines.add("Regenerate a corrected, executable read-only SELECT or WITH that satisfies the user request.");
        lines.add("Use ONLY tables and columns from the system schema prompt.");
        lines.add("Output must include real SQL to run — comments alone are invalid.");
        lines.add("Do not repeat the same mistake.");
        return String.join("\n", lines);
    }

    public static String renderExecutionRetryUserPrompt(
            String prompt,
            AiAnalysisContextDto context,
            String failedSql,
            String executionError,
            Integer errorLine
    ) {
        List<String> lines = new ArrayList<>();
        lines.add("User request:");
        lines.add(prompt != null ? prompt : "");
        if (context != null && context.previousSql() != null && !context.previousSql().isBlank()) {
            lines.add("");
            lines.add("Previous analysis SQL (for context):");
            lines.add(context.previousSql());
        }
        lines.add("");
        lines.add("The following SQL failed when executed against the database:");
        lines.add(failedSql != null ? failedSql : "");
        lines.add("");
        lines.add("Database error:");
        lines.add(executionError != null ? executionError : "unknown error");
        if (errorLine != null && errorLine > 0) {
            lines.add("Error near SQL line: " + errorLine);
        }
        lines.add("");
        lines.add("Analyze the error (unknown column/table/alias/join/syntax).");
        lines.add("The system prompt contains refreshed CREATE TABLE / column definitions for tables referenced in the failed SQL.");
        lines.add("Replace invalid column names with real columns from those definitions.");
        lines.add("Regenerate a corrected, executable read-only SELECT or WITH using ONLY columns and tables from the schema.");
        lines.add("You MUST return runnable SQL. Do not reply with comments, apologies, or analysis text only.");
        lines.add("Do not repeat the same mistake.");
        return String.join("\n", lines);
    }

    private static void appendEvidence(List<String> lines, AiEvidenceBundle evidence) {
        if (evidence == null || evidence.snippets() == null || evidence.snippets().isEmpty()) {
            return;
        }
        lines.add("Business glossary and schema comments (use as domain hints; still obey DDL column names):");
        for (AiEvidenceSnippet snippet : evidence.snippets()) {
            String label = snippet.title() != null && !snippet.title().isBlank()
                    ? snippet.title()
                    : snippet.source();
            lines.add("-- Evidence [" + snippet.source() + "]: " + label);
            lines.add(snippet.content());
        }
        if (evidence.hintedTables() != null && !evidence.hintedTables().isEmpty()) {
            lines.add("Suggested tables from evidence: " + String.join(", ", evidence.hintedTables()));
        }
    }
}
