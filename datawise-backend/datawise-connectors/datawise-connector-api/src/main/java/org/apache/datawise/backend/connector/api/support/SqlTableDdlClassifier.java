package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.sqlparser.SqlTransformOps;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Detects successful CREATE/DROP TABLE statements for outbound notifications. */
public final class SqlTableDdlClassifier {

    public enum Kind {
        CREATE,
        DROP
    }

    public record Match(Kind kind, String tableName) {
    }

    private static final Pattern CREATE_TABLE = Pattern.compile(
            "^CREATE\\s+(?:TEMPORARY\\s+|TEMP\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"
                    + "(?:(?:[`\"\\[]?[\\w.-]+[`\"\\]]?)\\s*\\.\\s*)?"
                    + "([`\"\\[]?[\\w$]+[`\"\\]]?)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    private static final Pattern DROP_TABLE = Pattern.compile(
            "^DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?"
                    + "(?:(?:[`\"\\[]?[\\w.-]+[`\"\\]]?)\\s*\\.\\s*)?"
                    + "([`\"\\[]?[\\w$]+[`\"\\]]?)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    private SqlTableDdlClassifier() {
    }

    public static Match match(String sql) {
        if (sql == null || sql.isBlank()) {
            return null;
        }
        String stripped = SqlTransformOps.stripComments(sql).trim();
        if (stripped.isEmpty()) {
            return null;
        }
        // First statement only (explorer actions send a single DDL statement).
        int semi = indexOfStatementEnd(stripped);
        String first = semi >= 0 ? stripped.substring(0, semi).trim() : stripped;
        if (first.isEmpty()) {
            return null;
        }
        Matcher create = CREATE_TABLE.matcher(first);
        if (create.find()) {
            return new Match(Kind.CREATE, unquote(create.group(1)));
        }
        Matcher drop = DROP_TABLE.matcher(first);
        if (drop.find()) {
            return new Match(Kind.DROP, unquote(drop.group(1)));
        }
        return null;
    }

    private static int indexOfStatementEnd(String sql) {
        boolean inSingle = false;
        boolean inDouble = false;
        boolean inBacktick = false;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'' && !inDouble && !inBacktick) {
                inSingle = !inSingle;
            } else if (c == '"' && !inSingle && !inBacktick) {
                inDouble = !inDouble;
            } else if (c == '`' && !inSingle && !inDouble) {
                inBacktick = !inBacktick;
            } else if (c == ';' && !inSingle && !inDouble && !inBacktick) {
                return i;
            }
        }
        return -1;
    }

    private static String unquote(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return "";
        }
        String value = identifier.trim();
        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '`' && last == '`')
                    || (first == '"' && last == '"')
                    || (first == '[' && last == ']')) {
                value = value.substring(1, value.length() - 1);
            }
        }
        return value;
    }
}
