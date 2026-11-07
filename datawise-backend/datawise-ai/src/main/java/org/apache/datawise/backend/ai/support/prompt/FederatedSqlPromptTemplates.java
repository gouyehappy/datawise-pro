package org.apache.datawise.backend.ai.support.prompt;

import org.apache.datawise.backend.model.FederatedViewSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class FederatedSqlPromptTemplates {

    private FederatedSqlPromptTemplates() {
    }

    public static String renderSystemPrompt() {
        return String.join("\n", List.of(
                "You are a federated SQL expert for DataWise cross-source analytics.",
                "Generate a federated view SQL that references each data source by alias using @alias markers.",
                "Each source subquery MUST use the pattern: (SELECT ... FROM ...) @alias",
                "Example:",
                "SELECT o.id, u.name",
                "FROM (SELECT id, user_id FROM orders WHERE dt >= '2024-01-01') @orders o",
                "JOIN (SELECT id, name FROM users) @users u ON o.user_id = u.id",
                "Rules:",
                "- Use ONLY tables/columns from the schema snippets provided per source.",
                "- Read-only SELECT only.",
                "- Return SQL only, no markdown fences.",
                "- Always include executable SELECT/WITH; comments alone are invalid.",
                "- Optional first line: -- AI federated: <short summary>"
        ));
    }

    public static String renderUserPrompt(
            String prompt,
            Map<String, FederatedSourceSchema> sourceSchemas
    ) {
        List<String> lines = new ArrayList<>();
        lines.add("User request:");
        lines.add(prompt != null ? prompt : "");
        lines.add("");
        lines.add("Data sources:");
        for (Map.Entry<String, FederatedSourceSchema> entry : sourceSchemas.entrySet()) {
            FederatedSourceSchema source = entry.getValue();
            lines.add("--- @" + entry.getKey() + " (" + source.connectionLabel() + " / " + source.database()
                    + ", " + source.dbType() + ") ---");
            if (source.tables() != null && !source.tables().isEmpty()) {
                lines.add("Tables: " + String.join(", ", source.tables()));
            }
            if (source.ddlSnippets() != null) {
                for (String ddl : source.ddlSnippets()) {
                    lines.add(ddl);
                }
            }
        }
        lines.add("");
        lines.add("Generate federated SQL joining the sources as needed.");
        return String.join("\n", lines);
    }

    public record FederatedSourceSchema(
            String connectionLabel,
            String database,
            String dbType,
            List<String> tables,
            List<String> ddlSnippets
    ) {
        public static FederatedSourceSchema from(
                FederatedViewSource source,
                String connectionLabel,
                String dbType,
                List<String> tables,
                List<String> ddlSnippets
        ) {
            String label = source.getConnectionLabel() != null && !source.getConnectionLabel().isBlank()
                    ? source.getConnectionLabel()
                    : connectionLabel;
            return new FederatedSourceSchema(
                    label,
                    source.getDatabase(),
                    dbType,
                    tables,
                    ddlSnippets
            );
        }
    }
}
