package org.apache.datawise.backend.ai.schema;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compresses CREATE TABLE DDL by dropping low-priority column lines instead of mid-string cuts.
 */
public final class AiSchemaDdlCompressor {

    private static final Pattern COLUMN_LINE = Pattern.compile(
            "^\\s*[`\"\\[]?([A-Za-z_][\\w$]*)[`\"\\]]?\\s+.+$"
    );

    private AiSchemaDdlCompressor() {
    }

    public static String compress(String ddl, int maxChars, Set<String> preferredColumns) {
        if (ddl == null) {
            return "";
        }
        String trimmed = ddl.trim();
        if (trimmed.length() <= maxChars) {
            return trimmed;
        }
        List<String> lines = trimmed.lines().map(String::stripTrailing).filter(line -> !line.isBlank()).toList();
        if (lines.size() <= 2) {
            return hardCap(trimmed, maxChars);
        }

        Set<String> preferred = normalizePreferred(preferredColumns);
        int openIdx = indexOfCreateOpen(lines);
        int closeIdx = indexOfClose(lines, openIdx);
        if (openIdx < 0 || closeIdx <= openIdx) {
            return hardCap(trimmed, maxChars);
        }

        List<String> header = new ArrayList<>(lines.subList(0, openIdx + 1));
        List<String> footer = new ArrayList<>(lines.subList(closeIdx, lines.size()));
        List<ScoredLine> body = new ArrayList<>();
        for (int i = openIdx + 1; i < closeIdx; i++) {
            String line = lines.get(i);
            String lower = line.toLowerCase(Locale.ROOT).trim();
            if (looksLikeConstraint(lower)) {
                body.add(new ScoredLine(line, 90, ""));
                continue;
            }
            Matcher matcher = COLUMN_LINE.matcher(line);
            String colName = matcher.find() ? matcher.group(1).toLowerCase(Locale.ROOT) : "";
            body.add(new ScoredLine(line, scoreColumnLine(lower, colName, preferred), colName));
        }

        body.sort(Comparator.comparingInt(ScoredLine::priority).reversed());

        List<String> kept = new ArrayList<>();
        for (ScoredLine column : body) {
            List<String> trial = assemble(header, appendCopy(kept, column.line()), footer, false);
            if (join(trial).length() <= maxChars || kept.isEmpty()) {
                kept.add(column.line());
            }
        }

        // If still over budget, keep only high-priority rows (preferred / PK / FK / constraints).
        if (join(assemble(header, kept, footer, false)).length() > maxChars) {
            List<String> essential = new ArrayList<>();
            for (ScoredLine column : body) {
                if (column.priority() < 70) {
                    continue;
                }
                List<String> trial = assemble(header, appendCopy(essential, column.line()), footer, false);
                if (join(trial).length() <= maxChars || essential.isEmpty()) {
                    essential.add(column.line());
                }
            }
            kept = essential;
        }

        // Drop lowest-priority kept lines until under budget (never mid-cut a column).
        while (kept.size() > 1
                && join(assemble(header, kept, footer, kept.size() < body.size())).length() > maxChars) {
            // body is priority-desc; kept was filled in that order — remove last (lowest among kept).
            kept.remove(kept.size() - 1);
        }

        boolean omitted = kept.size() < body.size();
        List<String> out = assemble(header, kept, footer, omitted);
        String joined = join(out);
        if (joined.length() <= maxChars) {
            return joined;
        }
        // Last resort: keep header + highest-priority column only.
        if (!kept.isEmpty()) {
            List<String> minimal = assemble(header, List.of(kept.get(0)), footer, true);
            String minimalJoined = join(minimal);
            if (minimalJoined.length() <= maxChars) {
                return minimalJoined;
            }
        }
        return hardCap(join(header) + "\n-- ... truncated", maxChars);
    }

    private static int indexOfCreateOpen(List<String> lines) {
        for (int i = 0; i < lines.size(); i++) {
            String lower = lines.get(i).toLowerCase(Locale.ROOT).trim();
            if (lower.contains("create table")) {
                return i;
            }
        }
        return -1;
    }

    private static int indexOfClose(List<String> lines, int openIdx) {
        for (int i = lines.size() - 1; i > openIdx; i--) {
            String lower = lines.get(i).toLowerCase(Locale.ROOT).trim();
            if (lower.equals(")") || lower.startsWith(");") || lower.equals(");")) {
                return i;
            }
        }
        return -1;
    }

    private static List<String> appendCopy(List<String> base, String line) {
        List<String> copy = new ArrayList<>(base);
        copy.add(line);
        return copy;
    }

    private static List<String> assemble(
            List<String> header,
            List<String> body,
            List<String> footer,
            boolean omitted
    ) {
        List<String> normalized = new ArrayList<>();
        for (int i = 0; i < body.size(); i++) {
            normalized.add(normalizeBodyLine(body.get(i), i < body.size() - 1));
        }
        List<String> out = new ArrayList<>(header);
        out.addAll(normalized);
        if (omitted) {
            out.add("-- ... columns omitted to fit schema budget");
        }
        out.addAll(footer);
        return out;
    }

    private static int scoreColumnLine(String lower, String colName, Set<String> preferred) {
        int score = 10;
        if (preferred.contains(colName)) {
            score += 100;
        }
        if (lower.contains("primary key")) {
            score += 80;
        }
        if (lower.contains("foreign key") || lower.contains(" references ")) {
            score += 70;
        }
        if (lower.contains(" unique") || lower.contains(" not null")) {
            score += 15;
        }
        if (colName.endsWith("_id") || "id".equals(colName)) {
            score += 25;
        }
        return score;
    }

    private static boolean looksLikeConstraint(String lower) {
        return lower.startsWith("primary key")
                || lower.startsWith("unique ")
                || lower.startsWith("unique(")
                || lower.startsWith("constraint ")
                || lower.startsWith("foreign key")
                || lower.startsWith("check ")
                || lower.startsWith("key ")
                || lower.startsWith("index ");
    }

    private static Set<String> normalizePreferred(Set<String> preferredColumns) {
        if (preferredColumns == null || preferredColumns.isEmpty()) {
            return Set.of();
        }
        Set<String> out = new LinkedHashSet<>();
        for (String name : preferredColumns) {
            if (name != null && !name.isBlank()) {
                out.add(name.trim().toLowerCase(Locale.ROOT));
            }
        }
        return out;
    }

    private static String normalizeBodyLine(String line, boolean needsComma) {
        String trimmed = line.stripTrailing();
        boolean hasComma = trimmed.endsWith(",");
        if (needsComma && !hasComma) {
            return trimmed + ",";
        }
        if (!needsComma && hasComma) {
            return trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static String join(List<String> lines) {
        return String.join("\n", lines);
    }

    private static String hardCap(String ddl, int maxChars) {
        if (ddl.length() <= maxChars) {
            return ddl;
        }
        return ddl.substring(0, Math.max(0, maxChars - 24)) + "\n-- ... truncated";
    }

    private record ScoredLine(String line, int priority, String columnName) {
    }
}
