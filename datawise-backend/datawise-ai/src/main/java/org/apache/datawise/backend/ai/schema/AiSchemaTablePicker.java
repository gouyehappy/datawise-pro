package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.ai.support.AiTableMatcher;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;

import java.util.ArrayList;
import java.util.List;

/**
 * prompt / evidence 中挑选与 SQL 生成相关的表名�?
 */
public final class AiSchemaTablePicker {

    private AiSchemaTablePicker() {
    }

    public static List<String> pickRelevantTables(String prompt, List<String> tables, AiEvidenceBundle evidence) {
        List<String> picked = new ArrayList<>();
        appendEvidenceHints(evidence, tables, picked);
        List<String> matched = AiTableMatcher.pickTables(prompt, tables, AiSchemaLimits.MAX_TABLES);
        for (String table : matched) {
            if (!picked.contains(table)) {
                picked.add(table);
            }
            if (picked.size() >= AiSchemaLimits.MAX_TABLES) {
                break;
            }
        }
        if (picked.isEmpty()) {
            return matched;
        }
        return picked.subList(0, Math.min(AiSchemaLimits.MAX_TABLES, picked.size()));
    }

    public static List<String> resolveTableNames(
            List<String> tableNames,
            List<String> allTables,
            AiEvidenceBundle evidence
    ) {
        List<String> picked = new ArrayList<>();
        if (tableNames != null) {
            for (String name : tableNames) {
                if (name == null || name.isBlank()) {
                    continue;
                }
                if (allTables.contains(name) && !picked.contains(name)) {
                    picked.add(name);
                }
            }
        }
        appendEvidenceHints(evidence, allTables, picked);
        if (picked.size() > AiSchemaLimits.MAX_TABLES) {
            return picked.subList(0, AiSchemaLimits.MAX_TABLES);
        }
        return picked;
    }

    private static void appendEvidenceHints(AiEvidenceBundle evidence, List<String> tables, List<String> picked) {
        if (evidence == null || evidence.hintedTables() == null) {
            return;
        }
        for (String hint : evidence.hintedTables()) {
            if (hint != null && tables.contains(hint) && !picked.contains(hint)) {
                picked.add(hint);
            }
        }
    }
}
