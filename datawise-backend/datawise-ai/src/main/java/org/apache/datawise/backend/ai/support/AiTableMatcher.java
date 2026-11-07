package org.apache.datawise.backend.ai.support;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 根据自然语言在已知表名中挑选相关表（与前端 pickTablesForPrompt 对齐）
 */
public final class AiTableMatcher {

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[a-z0-9_\\p{IsHan}]+");

    private AiTableMatcher() {
    }

    public static List<String> pickTables(String prompt, List<String> tables, int limit) {
        if (tables == null || tables.isEmpty()) {
            return List.of();
        }

        List<ScoredTable> scored = new ArrayList<>();
        for (String table : tables) {
            int score = scoreTable(prompt, table);
            if (score > 0) {
                scored.add(new ScoredTable(table, score));
            }
        }
        scored.sort(Comparator.comparingInt(ScoredTable::score).reversed());

        if (scored.isEmpty()) {
            return tables.subList(0, Math.min(limit, tables.size()));
        }

        List<String> picked = new ArrayList<>();
        for (ScoredTable item : scored) {
            if (picked.size() >= limit) {
                break;
            }
            picked.add(item.table());
        }

        for (ScoredTable item : scored) {
            if (picked.size() >= limit) {
                break;
            }
            if (picked.contains(item.table())) {
                continue;
            }
            List<String> parts = tableParts(item.table());
            boolean shares = picked.stream().anyMatch(name ->
                    tableParts(name).stream().anyMatch(parts::contains));
            if (shares) {
                picked.add(item.table());
            }
        }

        return picked.subList(0, Math.min(limit, picked.size()));
    }

    public static int scoreTable(String prompt, String table) {
        String promptNorm = normalize(prompt);
        List<String> promptTokens = tokens(promptNorm);
        String tableNorm = normalize(table);
        List<String> parts = tableParts(table);
        int score = 0;

        if (promptNorm.contains(tableNorm)) {
            score += 100;
        }

        for (String token : promptTokens) {
            if (token.length() < 2) {
                continue;
            }
            for (String part : parts) {
                if (part.equals(token)) {
                    score += part.length() * 12;
                } else if (part.length() >= 3 && token.length() >= 3
                        && (part.contains(token) || token.contains(part))) {
                    score += Math.min(part.length(), token.length()) * 3;
                }
            }
        }
        return score;
    }

    public static String pickTable(String prompt, List<String> tables) {
        List<String> picked = pickTables(prompt, tables, 1);
        return picked.isEmpty() ? null : picked.get(0);
    }

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_\\p{IsHan}]+", "");
    }

    private static List<String> tokens(String normalized) {
        Matcher matcher = TOKEN_PATTERN.matcher(normalized);
        List<String> result = new ArrayList<>();
        while (matcher.find()) {
            result.add(matcher.group());
        }
        return result;
    }

    private static List<String> tableParts(String table) {
        return List.of(normalize(table).split("_")).stream()
                .filter(part -> !part.isBlank())
                .toList();
    }

    private record ScoredTable(String table, int score) {
    }
}
