package org.apache.datawise.backend.lineage.parser.lakehouse;

import org.apache.datawise.backend.common.DbType;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects lakehouse-only SQL features and strips clauses that are safe to ignore for column lineage.
 */
public final class LakehouseSqlSupport {

    public static final Set<String> LAKEHOUSE_DB_TYPES = Set.of(
            DbType.HIVE.id(),
            DbType.FLINK.id(),
            DbType.KYLIN.id(),
            DbType.TRINO.id(),
            DbType.PRESTO.id(),
            "spark",
            "impala"
    );

    private static final Pattern LATERAL_VIEW = Pattern.compile("\\bLATERAL\\s+VIEW\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern MATCH_RECOGNIZE = Pattern.compile("\\bMATCH_RECOGNIZE\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern WITH_ORDINALITY = Pattern.compile("\\bWITH\\s+ORDINALITY\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern TRY_CAST = Pattern.compile("\\bTRY_CAST\\s*\\(", Pattern.CASE_INSENSITIVE);
    private static final Pattern QUALIFY = Pattern.compile("\\bQUALIFY\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PIVOT = Pattern.compile("\\b(UN)?PIVOT\\b", Pattern.CASE_INSENSITIVE);
    /** Snowflake/Databricks QUALIFY — strip through next major clause or EOS. */
    private static final Pattern QUALIFY_CLAUSE = Pattern.compile(
            "(?is)\\bQUALIFY\\b.+?(?=\\s+(?:ORDER\\s+BY|LIMIT|OFFSET|FETCH|UNION|EXCEPT|INTERSECT)|;|$)"
    );
    private static final Pattern ADVANCED_GROUPING = Pattern.compile(
            "\\b(GROUPING\\s+SETS|CUBE|ROLLUP)\\s*\\(",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern WINDOW_TVF = Pattern.compile(
            "\\b(TUMBLE|HOP|CUMULATE|SESSION)\\s*\\(",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern DISTRIBUTE_BY = Pattern.compile(
            "\\bDISTRIBUTE\\s+BY\\b[^;]*",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern CLUSTER_BY = Pattern.compile(
            "\\bCLUSTER\\s+BY\\b[^;]*",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SORT_BY = Pattern.compile(
            "\\bSORT\\s+BY\\b[^;]*",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern INSERT_OVERWRITE = Pattern.compile(
            "\\bINSERT\\s+OVERWRITE\\b",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern INSERT_PARTITION = Pattern.compile(
            "\\b(INSERT\\s+(?:INTO|OVERWRITE)(?:\\s+TABLE)?)\\s+([`\"\\[]?[\\w.]+[`\"\\]]?)\\s+PARTITION\\s*\\([^)]*\\)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern TABLESAMPLE = Pattern.compile(
            "\\bTABLESAMPLE\\s*\\([^)]*\\)",
            Pattern.CASE_INSENSITIVE
    );
    /** Hive LATERAL VIEW … AS cols — strip through next major clause or EOS. */
    private static final Pattern LATERAL_VIEW_CLAUSE = Pattern.compile(
            "(?is)\\bLATERAL\\s+VIEW\\s+(?:OUTER\\s+)?.+?(?=\\s+(?:LATERAL\\s+VIEW|WHERE|GROUP\\s+BY|ORDER\\s+BY|HAVING|LIMIT|DISTRIBUTE\\s+BY|CLUSTER\\s+BY|SORT\\s+BY|UNION|EXCEPT|INTERSECT)|;|$)"
    );
    private static final Pattern WINDOW_TVF_TABLE = Pattern.compile(
            "(?is)\\bTABLE\\s*\\(\\s*(TUMBLE|HOP|CUMULATE|SESSION)\\s*\\(\\s*TABLE\\s+([`\"\\[]?[\\w.]+[`\"\\]]?)"
    );
    private static final Pattern FROM_JOIN = Pattern.compile(
            "(?i)\\b(?:from|join)\\s+(?:`([^`]+)`|\"([^\"]+)\"|\\[([^\\]]+)\\]|([a-zA-Z0-9_.]+))"
    );
    private static final Set<String> TABLE_KEYWORDS = Set.of(
            "select", "where", "join", "inner", "left", "right", "full", "outer", "cross",
            "on", "as", "lateral", "values", "unnest", "table", "dual"
    );

    private LakehouseSqlSupport() {
    }

    public static boolean isLakehouseDialect(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        String normalized = DbType.normalizeId(dbType);
        if (LAKEHOUSE_DB_TYPES.contains(normalized)) {
            return true;
        }
        return DbType.HIVE.matches(dbType)
                || DbType.KUDU.matches(dbType)
                || DbType.FLINK.matches(dbType)
                || DbType.TRINO.matches(dbType)
                || DbType.PRESTO.matches(dbType)
                || DbType.KYLIN.matches(dbType);
    }

    /** Features that cannot be reduced to standard SELECT lineage without a stronger engine. */
    public static List<LakehouseFeature> detectHardFeatures(String sql) {
        if (sql == null || sql.isBlank()) {
            return List.of();
        }
        List<LakehouseFeature> features = new ArrayList<>();
        if (findOutsideQuotes(LATERAL_VIEW, sql)) {
            features.add(LakehouseFeature.LATERAL_VIEW);
        }
        if (findOutsideQuotes(MATCH_RECOGNIZE, sql)) {
            features.add(LakehouseFeature.MATCH_RECOGNIZE);
        }
        if (findOutsideQuotes(WITH_ORDINALITY, sql)) {
            features.add(LakehouseFeature.UNNEST_ORDINALITY);
        }
        if (findOutsideQuotes(TRY_CAST, sql)) {
            features.add(LakehouseFeature.TRY_CAST);
        }
        if (findOutsideQuotes(ADVANCED_GROUPING, sql)) {
            features.add(LakehouseFeature.ADVANCED_GROUPING);
        }
        if (findOutsideQuotes(QUALIFY, sql)) {
            features.add(LakehouseFeature.QUALIFY);
        }
        if (findOutsideQuotes(PIVOT, sql)) {
            features.add(LakehouseFeature.PIVOT);
        }
        if (findOutsideQuotes(WINDOW_TVF, sql)) {
            features.add(LakehouseFeature.WINDOW_TVF);
        }
        return List.copyOf(features);
    }

    /**
     * Softens hard features into AST-friendly SQL when possible (best-effort).
     * Column lineage from softened SQL is always PARTIAL.
     */
    public static SoftenResult softenHardFeatures(String sql) {
        if (sql == null || sql.isBlank()) {
            return new SoftenResult(sql == null ? "" : sql, List.of());
        }
        String current = sql;
        Set<String> applied = new LinkedHashSet<>();

        if (findOutsideQuotes(LATERAL_VIEW_CLAUSE, current)) {
            current = replaceAllOutsideQuotes(LATERAL_VIEW_CLAUSE, current, " ")
                    .replaceAll("\\s{2,}", " ")
                    .trim();
            applied.add("LATERAL_VIEW");
        }

        if (findOutsideQuotes(WINDOW_TVF_TABLE, current)) {
            StringBuilder rebuilt = new StringBuilder();
            int last = 0;
            Matcher m = WINDOW_TVF_TABLE.matcher(current);
            while (m.find()) {
                if (isInsideQuotes(current, m.start())) {
                    continue;
                }
                int open = indexOfOutsideQuotes(current, '(', m.start());
                int close = findMatchingParen(current, open);
                if (close < 0) {
                    continue;
                }
                rebuilt.append(current, last, m.start());
                rebuilt.append(stripQuotes(m.group(2)));
                last = close + 1;
                applied.add("WINDOW_TVF");
            }
            if (last > 0) {
                rebuilt.append(current.substring(last));
                current = rebuilt.toString().replaceAll("\\s{2,}", " ").trim();
            }
        }

        int matchIdx = indexOfKeywordIgnoreCase(current, "MATCH_RECOGNIZE");
        if (matchIdx >= 0) {
            int open = indexOfOutsideQuotes(current, '(', matchIdx);
            int close = open >= 0 ? findMatchingParen(current, open) : -1;
            if (close >= 0) {
                current = (current.substring(0, matchIdx) + " " + current.substring(close + 1))
                        .replaceAll("\\s{2,}", " ")
                        .trim();
                applied.add("MATCH_RECOGNIZE");
            }
        }

        if (findOutsideQuotes(WITH_ORDINALITY, current)) {
            current = replaceAllOutsideQuotes(WITH_ORDINALITY, current, " ")
                    .replaceAll("\\s{2,}", " ")
                    .trim();
            applied.add("UNNEST_ORDINALITY");
        }

        if (findOutsideQuotes(TRY_CAST, current)) {
            current = replaceAllOutsideQuotes(TRY_CAST, current, "CAST(");
            applied.add("TRY_CAST");
        }

        if (findOutsideQuotes(QUALIFY_CLAUSE, current)) {
            current = replaceAllOutsideQuotes(QUALIFY_CLAUSE, current, " ")
                    .replaceAll("\\s{2,}", " ")
                    .trim();
            applied.add("QUALIFY");
        }

        current = softenPivotClauses(current, applied);
        current = softenAdvancedGrouping(current, applied);

        return new SoftenResult(current, List.copyOf(applied));
    }

    /**
     * Strips {@code PIVOT (...)} / {@code UNPIVOT (...)} (and optional {@code AS alias}) so AST lineage
     * can continue on the base table reference (always PARTIAL).
     */
    private static String softenPivotClauses(String sql, Set<String> applied) {
        String current = sql;
        while (true) {
            int pivotIdx = indexOfKeywordIgnoreCase(current, "PIVOT");
            int unpivotIdx = indexOfKeywordIgnoreCase(current, "UNPIVOT");
            int start;
            String feature;
            if (pivotIdx >= 0 && (unpivotIdx < 0 || pivotIdx < unpivotIdx)) {
                start = pivotIdx;
                feature = "PIVOT";
            } else if (unpivotIdx >= 0) {
                start = unpivotIdx;
                feature = "UNPIVOT";
            } else {
                break;
            }
            int open = current.indexOf('(', start);
            if (open < 0 || isInsideQuotes(current, open)) {
                break;
            }
            int close = findMatchingParen(current, open);
            if (close < 0) {
                break;
            }
            int end = skipOptionalAsAlias(current, close + 1);
            current = (current.substring(0, start) + " " + current.substring(end))
                    .replaceAll("\\s{2,}", " ")
                    .trim();
            applied.add(feature);
        }
        return current;
    }

    private static int skipOptionalAsAlias(String sql, int from) {
        int i = from;
        while (i < sql.length() && Character.isWhitespace(sql.charAt(i))) {
            i++;
        }
        if (i + 2 <= sql.length()
                && sql.regionMatches(true, i, "as", 0, 2)
                && (i + 2 >= sql.length() || !isIdentChar(sql.charAt(i + 2)))) {
            i += 2;
            while (i < sql.length() && Character.isWhitespace(sql.charAt(i))) {
                i++;
            }
        }
        if (i >= sql.length()) {
            return i;
        }
        char ch = sql.charAt(i);
        if (ch == '`' || ch == '"' || ch == '[') {
            char close = ch == '[' ? ']' : ch;
            int end = sql.indexOf(close, i + 1);
            return end >= 0 ? end + 1 : i;
        }
        if (isIdentChar(ch)) {
            int end = i + 1;
            while (end < sql.length() && (isIdentChar(sql.charAt(end)) || sql.charAt(end) == '.')) {
                end++;
            }
            return end;
        }
        return i;
    }

    private static int indexOfKeywordIgnoreCase(String haystack, String keyword) {
        String lower = haystack.toLowerCase(Locale.ROOT);
        String needle = keyword.toLowerCase(Locale.ROOT);
        int from = 0;
        while (from <= lower.length() - needle.length()) {
            int idx = lower.indexOf(needle, from);
            if (idx < 0) {
                return -1;
            }
            if (isInsideQuotes(haystack, idx)) {
                from = idx + 1;
                continue;
            }
            boolean leftOk = idx == 0 || !isIdentChar(haystack.charAt(idx - 1));
            boolean rightOk = idx + needle.length() >= haystack.length()
                    || !isIdentChar(haystack.charAt(idx + needle.length()));
            if (leftOk && rightOk) {
                return idx;
            }
            from = idx + 1;
        }
        return -1;
    }

    private static boolean isIdentChar(char ch) {
        return Character.isLetterOrDigit(ch) || ch == '_';
    }

    /**
     * Rewrites {@code CUBE}/{@code ROLLUP}/{@code GROUPING SETS} calls to their first argument list
     * so AST lineage can continue (always PARTIAL).
     */
    private static String softenAdvancedGrouping(String sql, Set<String> applied) {
        String current = sql;
        if (!findOutsideQuotes(ADVANCED_GROUPING, current)) {
            return current;
        }
        StringBuilder rebuilt = new StringBuilder();
        int last = 0;
        Matcher matcher = ADVANCED_GROUPING.matcher(current);
        while (matcher.find()) {
            if (isInsideQuotes(current, matcher.start())) {
                continue;
            }
            int open = indexOfOutsideQuotes(current, '(', matcher.start());
            int close = findMatchingParen(current, open);
            if (close < 0) {
                continue;
            }
            String inner = current.substring(open + 1, close).trim();
            String replacement = firstGroupingArgs(inner);
            rebuilt.append(current, last, matcher.start());
            rebuilt.append(replacement);
            last = close + 1;
            applied.add("ADVANCED_GROUPING");
        }
        if (last == 0) {
            return current;
        }
        rebuilt.append(current.substring(last));
        return rebuilt.toString().replaceAll("\\s{2,}", " ").trim();
    }

    /** Prefer the first GROUPING SETS tuple; otherwise keep the raw args (CUBE/ROLLUP). */
    private static String firstGroupingArgs(String inner) {
        if (inner.isEmpty()) {
            return "1";
        }
        String trimmed = inner.trim();
        if (trimmed.startsWith("(")) {
            int close = findMatchingParen(trimmed, 0);
            if (close > 0) {
                String tuple = trimmed.substring(1, close).trim();
                return tuple.isEmpty() ? "1" : tuple;
            }
        }
        return trimmed;
    }

    public static NormalizationResult normalizeForLineage(String sql) {
        if (sql == null || sql.isBlank()) {
            return new NormalizationResult(sql == null ? "" : sql, List.of());
        }
        String current = sql;
        Set<String> applied = new LinkedHashSet<>();

        if (findOutsideQuotes(INSERT_PARTITION, current)) {
            current = replaceAllOutsideQuotes(INSERT_PARTITION, current, "$1 $2");
            applied.add("INSERT_PARTITION");
        }

        String next = replaceAllOutsideQuotes(INSERT_OVERWRITE, current, "INSERT INTO");
        if (!next.equals(current)) {
            applied.add("INSERT_OVERWRITE");
            current = next;
        }
        next = stripTrailingClause(current, DISTRIBUTE_BY);
        if (next != null) {
            applied.add("DISTRIBUTE_BY");
            current = next;
        }
        next = stripTrailingClause(current, CLUSTER_BY);
        if (next != null) {
            applied.add("CLUSTER_BY");
            current = next;
        }
        next = stripTrailingClause(current, SORT_BY);
        if (next != null) {
            applied.add("SORT_BY");
            current = next;
        }
        if (findOutsideQuotes(TABLESAMPLE, current)) {
            current = replaceAllOutsideQuotes(TABLESAMPLE, current, "");
            applied.add("TABLESAMPLE");
        }
        return new NormalizationResult(current.trim(), List.copyOf(applied));
    }

    /**
     * Best-effort physical table names from FROM / JOIN (for table-level lineage fallback).
     */
    public static List<String> extractPhysicalTables(String sql) {
        if (sql == null || sql.isBlank()) {
            return List.of();
        }
        Set<String> names = new LinkedHashSet<>();
        Matcher matcher = FROM_JOIN.matcher(sql);
        while (matcher.find()) {
            String raw = firstNonBlank(matcher.group(1), matcher.group(2), matcher.group(3), matcher.group(4));
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String table = raw.contains(".") ? raw.substring(raw.lastIndexOf('.') + 1) : raw;
            table = stripQuotes(table).trim();
            if (!table.isBlank() && !TABLE_KEYWORDS.contains(table.toLowerCase(Locale.ROOT))) {
                names.add(table);
            }
        }
        // Flink TABLE(TUMBLE(TABLE orders, …)) — capture inner TABLE name when FROM missed it
        Matcher tvf = WINDOW_TVF_TABLE.matcher(sql);
        while (tvf.find()) {
            String table = stripQuotes(tvf.group(2));
            if (table.contains(".")) {
                table = table.substring(table.lastIndexOf('.') + 1);
            }
            if (!table.isBlank()) {
                names.add(table);
            }
        }
        return List.copyOf(names);
    }

    private static String stripTrailingClause(String sql, Pattern pattern) {
        if (!findOutsideQuotes(pattern, sql)) {
            return null;
        }
        return replaceAllOutsideQuotes(pattern, sql, " ").replaceAll("\\s{2,}", " ").trim();
    }

    private static int findMatchingParen(String sql, int openIdx) {
        if (openIdx < 0 || openIdx >= sql.length() || sql.charAt(openIdx) != '(') {
            return -1;
        }
        int depth = 0;
        boolean inSingle = false;
        boolean inDouble = false;
        boolean inBacktick = false;
        for (int i = openIdx; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (inSingle) {
                if (c == '\'') {
                    if (i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                        i++;
                    } else {
                        inSingle = false;
                    }
                }
                continue;
            }
            if (inDouble) {
                if (c == '"') {
                    if (i + 1 < sql.length() && sql.charAt(i + 1) == '"') {
                        i++;
                    } else {
                        inDouble = false;
                    }
                }
                continue;
            }
            if (inBacktick) {
                if (c == '`') {
                    if (i + 1 < sql.length() && sql.charAt(i + 1) == '`') {
                        i++;
                    } else {
                        inBacktick = false;
                    }
                }
                continue;
            }
            if (c == '\'') {
                inSingle = true;
            } else if (c == '"') {
                inDouble = true;
            } else if (c == '`') {
                inBacktick = true;
            } else if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    /**
     * True when {@code index} lies inside a single/double/backtick string literal
     * (scan from start; doubled quotes escape).
     */
    static boolean isInsideQuotes(String sql, int index) {
        if (sql == null || index <= 0 || index > sql.length()) {
            return false;
        }
        boolean inSingle = false;
        boolean inDouble = false;
        boolean inBacktick = false;
        for (int i = 0; i < index; i++) {
            char c = sql.charAt(i);
            if (inSingle) {
                if (c == '\'') {
                    if (i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                        i++;
                    } else {
                        inSingle = false;
                    }
                }
                continue;
            }
            if (inDouble) {
                if (c == '"') {
                    if (i + 1 < sql.length() && sql.charAt(i + 1) == '"') {
                        i++;
                    } else {
                        inDouble = false;
                    }
                }
                continue;
            }
            if (inBacktick) {
                if (c == '`') {
                    if (i + 1 < sql.length() && sql.charAt(i + 1) == '`') {
                        i++;
                    } else {
                        inBacktick = false;
                    }
                }
                continue;
            }
            if (c == '\'') {
                inSingle = true;
            } else if (c == '"') {
                inDouble = true;
            } else if (c == '`') {
                inBacktick = true;
            }
        }
        return inSingle || inDouble || inBacktick;
    }

    private static boolean findOutsideQuotes(Pattern pattern, String sql) {
        int from = 0;
        while (from < sql.length()) {
            Matcher matcher = pattern.matcher(sql);
            if (!matcher.find(from)) {
                return false;
            }
            if (!isInsideQuotes(sql, matcher.start())) {
                return true;
            }
            from = matcher.start() + 1;
        }
        return false;
    }

    private static String replaceAllOutsideQuotes(Pattern pattern, String sql, String replacement) {
        StringBuilder rebuilt = new StringBuilder();
        int last = 0;
        int from = 0;
        boolean any = false;
        while (from < sql.length()) {
            Matcher matcher = pattern.matcher(sql);
            if (!matcher.find(from)) {
                break;
            }
            if (isInsideQuotes(sql, matcher.start())) {
                from = matcher.start() + 1;
                continue;
            }
            rebuilt.append(sql, last, matcher.start());
            Matcher local = pattern.matcher(matcher.group());
            rebuilt.append(local.replaceFirst(replacement));
            last = matcher.end();
            from = matcher.end();
            any = true;
        }
        if (!any) {
            return sql;
        }
        rebuilt.append(sql, last, sql.length());
        return rebuilt.toString();
    }

    private static int indexOfOutsideQuotes(String sql, char needle, int from) {
        for (int i = Math.max(0, from); i < sql.length(); i++) {
            if (sql.charAt(i) == needle && !isInsideQuotes(sql, i)) {
                return i;
            }
        }
        return -1;
    }

    private static String stripQuotes(String raw) {
        if (raw == null || raw.length() < 2) {
            return raw == null ? "" : raw;
        }
        char first = raw.charAt(0);
        char last = raw.charAt(raw.length() - 1);
        if ((first == '`' && last == '`')
                || (first == '"' && last == '"')
                || (first == '[' && last == ']')) {
            return raw.substring(1, raw.length() - 1);
        }
        return raw;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    public enum LakehouseFeature {
        LATERAL_VIEW("Hive LATERAL VIEW / explode is not supported for automatic lineage yet"),
        MATCH_RECOGNIZE("MATCH_RECOGNIZE pattern matching is not supported for automatic lineage yet"),
        UNNEST_ORDINALITY("UNNEST … WITH ORDINALITY ordinal column is not supported for automatic lineage yet"),
        TRY_CAST("TRY_CAST is softened to CAST; failure-null semantics are not modeled in lineage"),
        ADVANCED_GROUPING("GROUPING SETS / CUBE / ROLLUP are softened to a simple GROUP BY list"),
        QUALIFY("QUALIFY filter is stripped for lineage; window-filter semantics are not modeled"),
        PIVOT("PIVOT / UNPIVOT are stripped for lineage; reshaped columns are not modeled"),
        WINDOW_TVF("Flink window TVFs (TUMBLE/HOP/CUMULATE/SESSION) are not supported for automatic lineage yet");

        private final String message;

        LakehouseFeature(String message) {
            this.message = message;
        }

        public String code() {
            return "LAKEHOUSE_" + name();
        }

        public String message() {
            return message;
        }
    }

    public record NormalizationResult(String sql, List<String> strippedClauses) {
        public boolean changed() {
            return strippedClauses != null && !strippedClauses.isEmpty();
        }
    }

    public record SoftenResult(String sql, List<String> softenedFeatures) {
        public boolean changed() {
            return softenedFeatures != null && !softenedFeatures.isEmpty();
        }
    }
}
