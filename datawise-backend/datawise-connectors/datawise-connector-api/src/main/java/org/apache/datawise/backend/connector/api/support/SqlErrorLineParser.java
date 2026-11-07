package org.apache.datawise.backend.connector.api.support;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 从 JDBC / 数据库错误信息中解析 SQL 行号
 */
public final class SqlErrorLineParser {

    private static final Pattern[] LINE_PATTERNS = {
            Pattern.compile("(?i)at line (\\d+)"),
            Pattern.compile("(?i),\\s*Line (\\d+)\\b"),
            Pattern.compile("(?i)\\bLine (\\d+)\\b"),
            Pattern.compile("(?i)\\bline (\\d+)\\b"),
            Pattern.compile("在第 (\\d+) 行"),
    };

    private static final Pattern POSITION_PATTERN = Pattern.compile("(?i)Position:\\s*(\\d+)");

    private SqlErrorLineParser() {
    }

    public static Integer parseLine(String message, String sql) {
        if (message == null || message.isBlank()) {
            return null;
        }

        for (Pattern pattern : LINE_PATTERNS) {
            Matcher matcher = pattern.matcher(message);
            if (matcher.find()) {
                return parsePositiveInt(matcher.group(1));
            }
        }

        Matcher position = POSITION_PATTERN.matcher(message);
        if (position.find() && sql != null && !sql.isBlank()) {
            return charPositionToLine(sql, parsePositiveInt(position.group(1)));
        }

        return null;
    }

    private static Integer charPositionToLine(String sql, Integer position) {
        if (position == null || position < 1) {
            return null;
        }
        int index = Math.min(position - 1, sql.length());
        return sql.substring(0, index).split("\n", -1).length;
    }

    private static Integer parsePositiveInt(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            int parsed = Integer.parseInt(value.trim());
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
