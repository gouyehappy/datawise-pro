package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.ai.support.AiTableMatcher;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Pick tables relevant to a prompt / evidence for AI schema context.
 */
public final class AiSchemaTablePicker {

    private AiSchemaTablePicker() {
    }

    public static List<String> pickRelevantTables(String prompt, List<String> tables, AiEvidenceBundle evidence) {
        if (tables == null || tables.isEmpty()) {
            return List.of();
        }
        Set<String> evidenceBoost = evidenceTableSet(evidence);
        List<Scored> scored = new ArrayList<>();
        for (String table : tables) {
            int score = AiTableMatcher.scoreTable(prompt, table);
            if (evidenceBoost.contains(normalize(table))) {
                score += 200;
            }
            if (score > 0) {
                scored.add(new Scored(table, score));
            }
        }
        scored.sort(Comparator.comparingInt(Scored::score).reversed().thenComparing(Scored::table));

        List<String> picked = new ArrayList<>();
        for (Scored item : scored) {
            if (picked.size() >= AiSchemaLimits.MAX_TABLES) {
                break;
            }
            if (!picked.contains(item.table())) {
                picked.add(item.table());
            }
        }
        if (!picked.isEmpty()) {
            return picked;
        }
        // No keyword hit: keep stable prefix (legacy fallback) rather than empty.
        return tables.subList(0, Math.min(AiSchemaLimits.MAX_TABLES, tables.size()));
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
        for (String hint : evidenceTableSet(evidence)) {
            for (String table : allTables) {
                if (normalize(table).equals(hint) && !picked.contains(table)) {
                    picked.add(table);
                }
            }
        }
        if (picked.size() > AiSchemaLimits.MAX_TABLES) {
            return picked.subList(0, AiSchemaLimits.MAX_TABLES);
        }
        return picked;
    }

    private static Set<String> evidenceTableSet(AiEvidenceBundle evidence) {
        Set<String> out = new LinkedHashSet<>();
        if (evidence == null || evidence.hintedTables() == null) {
            return out;
        }
        for (String hint : evidence.hintedTables()) {
            if (hint != null && !hint.isBlank()) {
                out.add(normalize(hint));
            }
        }
        return out;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private record Scored(String table, int score) {
    }
}
