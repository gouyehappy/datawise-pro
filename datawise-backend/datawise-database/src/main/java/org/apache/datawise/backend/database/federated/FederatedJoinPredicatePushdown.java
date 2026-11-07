package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinPlan;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinStep;
import org.apache.datawise.sqlparser.SqlTransformOps;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pushes single-table-alias conjuncts from the outer WHERE into each source subquery
 * (including single-alias {@code OR} / {@code IS [NOT] NULL} / {@code [NOT] LIKE} /
 * {@code UPPER}/{@code LOWER}/{@code TRIM}/{@code LTRIM}/{@code RTRIM} /
 * {@code LENGTH}/{@code CHAR_LENGTH}/{@code ABS}/{@code ROUND}/{@code CEIL}/{@code FLOOR}/
 * {@code GREATEST}/{@code LEAST}/{@code COALESCE}/{@code NULLIF}/
 * {@code CONCAT}/{@code SUBSTR}/{@code ||}/{@code CAST} /
 * {@code [NOT] BETWEEN} / {@code IN} forms).
 * Cross-alias (or unqualified) predicates — including OR groups that touch multiple aliases —
 * remain as residual filters for in-memory evaluation.
 */
final class FederatedJoinPredicatePushdown {

    private static final Pattern QUALIFIED_REF = Pattern.compile(
            "(?i)\\b([a-zA-Z_][a-zA-Z0-9_]*)\\.([a-zA-Z_][a-zA-Z0-9_]*)\\b"
    );

    private FederatedJoinPredicatePushdown() {
    }

    record PushdownResult(FederatedJoinPlan plan, String residualWhere, Map<String, String> pushedByTableAlias) {
    }

    static PushdownResult apply(FederatedJoinPlan plan) {
        if (plan == null || plan.outerWhere() == null || plan.outerWhere().isBlank()) {
            return new PushdownResult(plan, null, Map.of());
        }
        Set<String> tableAliases = new LinkedHashSet<>();
        for (FederatedJoinStep step : plan.steps()) {
            if (step.tableAlias() != null && !step.tableAlias().isBlank()) {
                tableAliases.add(step.tableAlias().toLowerCase(Locale.ROOT));
            }
        }

        Map<String, List<String>> pushed = new LinkedHashMap<>();
        List<String> residual = new ArrayList<>();
        for (String conjunct : splitAnd(plan.outerWhere())) {
            Set<String> refs = referencedAliases(conjunct, tableAliases);
            if (refs.size() == 1) {
                String alias = refs.iterator().next();
                pushed.computeIfAbsent(alias, ignored -> new ArrayList<>())
                        .add(stripTableAlias(conjunct, alias));
            } else {
                residual.add(conjunct);
            }
        }

        if (pushed.isEmpty()) {
            return new PushdownResult(
                    new FederatedJoinPlan(plan.selectItems(), plan.steps(), null),
                    joinAnd(residual),
                    Map.of()
            );
        }

        List<FederatedJoinStep> rewritten = new ArrayList<>(plan.steps().size());
        Map<String, String> pushedSql = new LinkedHashMap<>();
        for (FederatedJoinStep step : plan.steps()) {
            String aliasKey = step.tableAlias() == null ? "" : step.tableAlias().toLowerCase(Locale.ROOT);
            List<String> predicates = pushed.get(aliasKey);
            if (predicates == null || predicates.isEmpty()) {
                rewritten.add(step);
                continue;
            }
            String predicate = joinAnd(predicates);
            String baseSql = step.subQuery();
            if (baseSql == null || baseSql.isBlank()) {
                baseSql = SqlTransformOps.selectAllFrom(step.sourceAlias());
            }
            String nextSql = SqlTransformOps.appendWhere(baseSql, predicate);
            pushedSql.put(step.tableAlias(), predicate);
            rewritten.add(new FederatedJoinStep(
                    step.sourceAlias(),
                    step.tableAlias(),
                    nextSql,
                    step.onCondition()
            ));
        }

        return new PushdownResult(
                new FederatedJoinPlan(plan.selectItems(), rewritten, null),
                joinAnd(residual),
                Map.copyOf(pushedSql)
        );
    }

    static List<String> splitAnd(String where) {
        return splitBoolean(where, "and", 3);
    }

    /** Split on top-level {@code OR} (paren-aware; does not split inside parentheses). */
    static List<String> splitOr(String where) {
        return splitBoolean(where, "or", 2);
    }

    private static List<String> splitBoolean(String where, String keyword, int keywordLength) {
        List<String> parts = new ArrayList<>();
        if (where == null || where.isBlank()) {
            return parts;
        }
        StringBuilder current = new StringBuilder();
        int depth = 0;
        boolean pendingBetweenAnd = false;
        for (int i = 0; i < where.length(); ) {
            if (depth == 0 && matchesKeyword(where, i, "between", 7)) {
                pendingBetweenAnd = true;
                for (int j = 0; j < 7; j++) {
                    current.append(where.charAt(i + j));
                }
                i += 7;
                continue;
            }
            if (depth == 0 && matchesKeyword(where, i, keyword, keywordLength)) {
                if ("and".equalsIgnoreCase(keyword) && pendingBetweenAnd) {
                    pendingBetweenAnd = false;
                    for (int j = 0; j < keywordLength; j++) {
                        current.append(where.charAt(i + j));
                    }
                    i += keywordLength;
                    continue;
                }
                addPart(parts, current);
                current = new StringBuilder();
                pendingBetweenAnd = false;
                i += keywordLength;
                while (i < where.length() && Character.isWhitespace(where.charAt(i))) {
                    i++;
                }
                continue;
            }
            char ch = where.charAt(i);
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                depth = Math.max(0, depth - 1);
            }
            current.append(ch);
            i++;
        }
        addPart(parts, current);
        return parts;
    }

    private static boolean matchesKeyword(String sql, int index, String keyword, int keywordLength) {
        if (index + keywordLength > sql.length()) {
            return false;
        }
        if (!sql.regionMatches(true, index, keyword, 0, keywordLength)) {
            return false;
        }
        boolean leftOk = index == 0 || !isIdentChar(sql.charAt(index - 1));
        boolean rightOk = index + keywordLength >= sql.length()
                || !isIdentChar(sql.charAt(index + keywordLength));
        return leftOk && rightOk;
    }

    private static boolean isIdentChar(char ch) {
        return Character.isLetterOrDigit(ch) || ch == '_';
    }

    private static void addPart(List<String> parts, StringBuilder current) {
        String part = current.toString().trim();
        if (!part.isEmpty()) {
            parts.add(part);
        }
    }

    private static Set<String> referencedAliases(String conjunct, Set<String> tableAliases) {
        Set<String> found = new LinkedHashSet<>();
        Matcher matcher = QUALIFIED_REF.matcher(conjunct);
        while (matcher.find()) {
            String alias = matcher.group(1).toLowerCase(Locale.ROOT);
            if (tableAliases.contains(alias)) {
                found.add(alias);
            }
        }
        return found;
    }

    static String stripTableAlias(String conjunct, String tableAlias) {
        if (conjunct == null || tableAlias == null || tableAlias.isBlank()) {
            return conjunct;
        }
        Pattern pattern = Pattern.compile(
                "(?i)\\b" + Pattern.quote(tableAlias) + "\\."
        );
        return pattern.matcher(conjunct).replaceAll("");
    }

    private static String joinAnd(List<String> parts) {
        if (parts == null || parts.isEmpty()) {
            return null;
        }
        return String.join(" AND ", parts);
    }
}
