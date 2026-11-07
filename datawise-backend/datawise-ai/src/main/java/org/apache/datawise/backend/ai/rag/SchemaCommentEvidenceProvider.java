package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 从 JDBC 表/列注释提取 evidence
 */
@Component
public class SchemaCommentEvidenceProvider {

    private static final Logger log = LoggerFactory.getLogger(SchemaCommentEvidenceProvider.class);

    private static final int MAX_TABLES = 4;
    private static final int MAX_COLUMNS_PER_TABLE = 12;

    private final TableDetailService tableDetailService;

    public SchemaCommentEvidenceProvider(TableDetailService tableDetailService) {
        this.tableDetailService = tableDetailService;
    }

    public List<AiEvidenceSnippet> load(
            String connectionId,
            String database,
            List<String> candidateTables
    ) {
        if (candidateTables == null || candidateTables.isEmpty()) {
            return List.of();
        }
        Set<String> tables = new LinkedHashSet<>();
        for (String table : candidateTables) {
            if (table != null && !table.isBlank()) {
                tables.add(table.trim());
            }
            if (tables.size() >= MAX_TABLES) {
                break;
            }
        }

        List<AiEvidenceSnippet> snippets = new ArrayList<>();
        for (String table : tables) {
            try {
                TablePropertiesResult properties = tableDetailService.loadProperties(table, connectionId, database);
                StringBuilder builder = new StringBuilder();
                if (properties.comment() != null && !properties.comment().isBlank()) {
                    builder.append("表注释: ").append(properties.comment().trim());
                }
                if (properties.columns() != null) {
                    int columnCount = 0;
                    for (TableColumnDetail column : properties.columns()) {
                        if (column.comment() == null || column.comment().isBlank()) {
                            continue;
                        }
                        if (builder.length() > 0) {
                            builder.append('\n');
                        }
                        builder.append(column.name())
                                .append(" (")
                                .append(column.dataType())
                                .append("): ")
                                .append(column.comment().trim());
                        columnCount++;
                        if (columnCount >= MAX_COLUMNS_PER_TABLE) {
                            break;
                        }
                    }
                }
                if (builder.length() > 0) {
                    snippets.add(AiEvidenceSnippet.schemaComment(table, builder.toString(), 50));
                }
            } catch (RuntimeException ex) {
                ExceptionLogging.recoverable(log, "Skip schema comment for table " + table, ex);
            }
        }
        return snippets;
    }

    public List<String> tablesMentionedInPrompt(String prompt, List<String> allTables) {
        if (prompt == null || allTables == null || allTables.isEmpty()) {
            return List.of();
        }
        String promptNorm = prompt.toLowerCase(Locale.ROOT);
        List<String> matched = new ArrayList<>();
        for (String table : allTables) {
            if (table != null && promptNorm.contains(table.toLowerCase(Locale.ROOT))) {
                matched.add(table);
            }
        }
        return matched;
    }
}
