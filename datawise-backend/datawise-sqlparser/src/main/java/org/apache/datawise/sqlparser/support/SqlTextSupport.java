package org.apache.datawise.sqlparser.support;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Lightweight SQL text normalization (no parse required). */
public final class SqlTextSupport {

    private static final Pattern TRAILING_SEMICOLON = Pattern.compile(";\\s*$");

    private SqlTextSupport() {
    }

    public static String stripTrailingSemicolon(String sql) {
        if (sql == null || sql.isBlank()) {
            return "";
        }
        return TRAILING_SEMICOLON.matcher(sql.trim()).replaceAll("").trim();
    }

    public static String normalizeForClassification(String sql) {
        return stripTrailingSemicolon(sql).toUpperCase(Locale.ROOT);
    }

    public static String stripComments(String sql) {
        if (sql == null || sql.isBlank()) {
            return "";
        }
        String noBlock = sql.replaceAll("/\\*[\\s\\S]*?\\*/", " ");
        return noBlock.lines()
                .map(line -> {
                    int idx = line.indexOf("--");
                    return idx >= 0 ? line.substring(0, idx) : line;
                })
                .reduce("", (a, b) -> a + b + "\n");
    }

    public static String firstStatement(String sql) {
        if (sql == null || sql.isBlank()) {
            return "";
        }
        List<String> statements = splitStatements(sql);
        return statements.isEmpty() ? sql.trim() : statements.get(0);
    }

    public static List<String> splitStatements(String sql) {
        List<String> statements = new ArrayList<>();
        int start = 0;
        for (int i = 0; i < sql.length(); i++) {
            if (sql.charAt(i) != ';') {
                continue;
            }
            if (!isSemicolonOutsideLiteral(sql, i)) {
                continue;
            }
            String piece = sql.substring(start, i).trim();
            if (!piece.isEmpty()) {
                statements.add(piece);
            }
            start = i + 1;
        }
        String tail = sql.substring(start).trim();
        if (!tail.isEmpty()) {
            statements.add(tail);
        }
        return statements;
    }

    public static boolean isSemicolonOutsideLiteral(String sql, int index) {
        boolean inSingle = false;
        boolean inDouble = false;
        boolean inBacktick = false;
        boolean inLineComment = false;
        boolean inBlockComment = false;

        for (int i = 0; i < index; i++) {
            char ch = sql.charAt(i);
            char next = i + 1 < sql.length() ? sql.charAt(i + 1) : '\0';

            if (inLineComment) {
                if (ch == '\n') {
                    inLineComment = false;
                }
                continue;
            }
            if (inBlockComment) {
                if (ch == '*' && next == '/') {
                    inBlockComment = false;
                    i++;
                }
                continue;
            }
            if (inSingle) {
                if (ch == '\'' && sql.charAt(i - 1) != '\\') {
                    inSingle = false;
                }
                continue;
            }
            if (inDouble) {
                if (ch == '"' && sql.charAt(i - 1) != '\\') {
                    inDouble = false;
                }
                continue;
            }
            if (inBacktick) {
                if (ch == '`') {
                    inBacktick = false;
                }
                continue;
            }

            if (ch == '-' && next == '-') {
                inLineComment = true;
                i++;
                continue;
            }
            if (ch == '/' && next == '*') {
                inBlockComment = true;
                i++;
                continue;
            }
            if (ch == '\'') {
                inSingle = true;
                continue;
            }
            if (ch == '"') {
                inDouble = true;
                continue;
            }
            if (ch == '`') {
                inBacktick = true;
            }
        }

        return !inSingle && !inDouble && !inBacktick && !inLineComment && !inBlockComment;
    }
}
