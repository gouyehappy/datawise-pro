package org.apache.datawise.backend.database.federated;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Best-effort in-memory evaluation of residual outer WHERE after federated JOIN.
 * Supports AND of atoms, OR within a conjunct, and bare {@code NOT} over a supported
 * atom or parenthesized group
 * ({@code NOT o.status = 'closed'}, {@code NOT (o.a = 1 OR u.b = 2)}).
 * Each atom is a simple comparison ({@code = != <> < <= > >=}),
 * {@code alias.col IS [NOT] NULL},
 * {@code alias.col [NOT] LIKE 'pattern'},
 * expression functions ({@code UPPER}/{@code LOWER}/{@code TRIM}/{@code LTRIM}/{@code RTRIM}/
 * {@code LENGTH}/{@code CHAR_LENGTH}/{@code ABS}/{@code ROUND}/{@code CEIL}/{@code FLOOR}/
 * {@code GREATEST}/{@code LEAST}/{@code COALESCE}/{@code NULLIF}/
 * {@code CONCAT}/{@code SUBSTR}/{@code SUBSTRING}/{@code ||}/{@code CAST(expr AS type)}/
 * {@code CASE WHEN … THEN … ELSE … END} (prefer parenthesized CASE in comparisons)} in
 * comparisons / LIKE / BETWEEN,
 * {@code alias.col [NOT] BETWEEN low AND high},
 * or {@code alias.col IN (...)} / {@code NOT IN (...)} with literal list values.
 */
final class FederatedJoinResidualFilter {

    private FederatedJoinResidualFilter() {
    }

    static List<Map<String, Object>> apply(List<Map<String, Object>> rows, String residualWhere) {
        if (rows == null || rows.isEmpty() || residualWhere == null || residualWhere.isBlank()) {
            return rows;
        }
        List<String> conjuncts = FederatedJoinPredicatePushdown.splitAnd(residualWhere);
        return rows.stream()
                .filter(row -> conjuncts.stream().allMatch(c -> matchesConjunct(row, c)))
                .toList();
    }

    private static boolean matchesConjunct(Map<String, Object> row, String conjunct) {
        String unwrapped = FederatedJoinSqlTokens.unwrapOuterParens(conjunct);
        List<String> disjuncts = FederatedJoinPredicatePushdown.splitOr(unwrapped);
        if (disjuncts.size() > 1) {
            return disjuncts.stream().anyMatch(d -> matchesAtom(row, FederatedJoinSqlTokens.unwrapOuterParens(d)));
        }
        return matchesAtom(row, unwrapped);
    }

    private static boolean matchesAtom(Map<String, Object> row, String atom) {
        String notInner = FederatedJoinNullInSupport.stripLeadingNot(atom);
        if (notInner != null) {
            return !matchesConjunct(row, notInner);
        }
        FederatedJoinNullInSupport.NullCheck nullCheck = FederatedJoinNullInSupport.parseNullCheck(atom);
        if (nullCheck != null) {
            Object value = resolve(row, nullCheck.column());
            boolean isNull = value == null;
            return nullCheck.negated() != isNull;
        }
        FederatedJoinNullInSupport.InPredicate inPredicate = FederatedJoinNullInSupport.parseInPredicate(atom);
        if (inPredicate != null) {
            Object value = resolve(row, inPredicate.left());
            boolean contained = false;
            for (Object candidate : inPredicate.values()) {
                if (eq(value, candidate)) {
                    contained = true;
                    break;
                }
            }
            return inPredicate.negated() != contained;
        }
        FederatedJoinLikeSupport.LikePredicate likePredicate = FederatedJoinLikeSupport.parseLikePredicate(atom);
        if (likePredicate != null) {
            Object value = resolve(row, likePredicate.left());
            boolean matched = FederatedJoinLikeSupport.likeMatches(
                    value, likePredicate.pattern(), likePredicate.escape());
            return likePredicate.negated() != matched;
        }
        FederatedJoinBetweenSupport.BetweenPredicate betweenPredicate =
                FederatedJoinBetweenSupport.parseBetweenPredicate(atom);
        if (betweenPredicate != null) {
            Object value = resolve(row, betweenPredicate.left());
            Object low = resolve(row, betweenPredicate.low());
            Object high = resolve(row, betweenPredicate.high());
            return FederatedJoinBetweenSupport.betweenMatches(value, low, high, betweenPredicate.negated());
        }
        Comparison comparison = parseComparison(atom);
        if (comparison == null) {
            throw new IllegalArgumentException(
                    "Unsupported federated residual WHERE predicate (push single-alias filters into source "
                            + "subqueries or use simple comparisons / IS NULL / LIKE / BETWEEN / "
                            + "LENGTH|ABS|ROUND|CEIL|FLOOR|GREATEST|LEAST|COALESCE|CONCAT|SUBSTR / UPPER|LOWER|TRIM / CAST / CASE / IN / NOT / OR "
                            + "of those): "
                            + atom
            );
        }
        Object left = resolve(row, comparison.left());
        Object right = resolve(row, comparison.right());
        return compare(left, right, comparison.op());
    }

    /**
     * Parse {@code left [NOT] LIKE 'pattern' [ESCAPE 'x']}.
     * @see FederatedJoinLikeSupport#parseLikePredicate(String)
     */
    static FederatedJoinLikeSupport.LikePredicate parseLikePredicate(String atom) {
        return FederatedJoinLikeSupport.parseLikePredicate(atom);
    }

    static FederatedJoinBetweenSupport.BetweenPredicate parseBetweenPredicate(String atom) {
        return FederatedJoinBetweenSupport.parseBetweenPredicate(atom);
    }

    static boolean betweenMatches(Object value, Object low, Object high, boolean negated) {
        return FederatedJoinBetweenSupport.betweenMatches(value, low, high, negated);
    }

    static boolean likeMatches(Object value, String pattern) {
        return FederatedJoinLikeSupport.likeMatches(value, pattern);
    }

    static boolean likeMatches(Object value, String pattern, Character escape) {
        return FederatedJoinLikeSupport.likeMatches(value, pattern, escape);
    }

    static java.util.regex.Pattern toLikeRegex(String pattern) {
        return FederatedJoinLikeSupport.toLikeRegex(pattern);
    }

    static java.util.regex.Pattern toLikeRegex(String pattern, Character escape) {
        return FederatedJoinLikeSupport.toLikeRegex(pattern, escape);
    }

    static FederatedJoinNullInSupport.NullCheck parseNullCheck(String atom) {
        return FederatedJoinNullInSupport.parseNullCheck(atom);
    }

    static String stripLeadingNot(String atom) {
        return FederatedJoinNullInSupport.stripLeadingNot(atom);
    }

    static FederatedJoinNullInSupport.InPredicate parseInPredicate(String atom) {
        return FederatedJoinNullInSupport.parseInPredicate(atom);
    }

    static List<Object> parseLiteralList(String listBody) {
        return FederatedJoinNullInSupport.parseLiteralList(listBody);
    }

    /** Unwrap one or more layers of fully wrapping parentheses. */
    static String unwrapOuterParens(String expression) {
        return FederatedJoinSqlTokens.unwrapOuterParens(expression);
    }

    private static Comparison parseComparison(String conjunct) {
        if (conjunct == null || conjunct.isBlank()) {
            return null;
        }
        String trimmed = conjunct.trim();
        String[] ops = {"<>", "!=", "<=", ">=", "=", "<", ">"};
        for (String op : ops) {
            int idx = findOperator(trimmed, op);
            if (idx >= 0) {
                String left = trimmed.substring(0, idx).trim();
                String right = trimmed.substring(idx + op.length()).trim();
                if (!left.isEmpty() && !right.isEmpty()) {
                    return new Comparison(left, op, right);
                }
            }
        }
        return null;
    }

    private static int findOperator(String text, String op) {
        int depth = 0;
        boolean inSingle = false;
        boolean inDouble = false;
        for (int i = 0; i <= text.length() - op.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '\'' && !inDouble) {
                inSingle = !inSingle;
            } else if (ch == '"' && !inSingle) {
                inDouble = !inDouble;
            } else if (!inSingle && !inDouble) {
                if (ch == '(') {
                    depth++;
                } else if (ch == ')') {
                    depth = Math.max(0, depth - 1);
                } else if (depth == 0 && text.regionMatches(i, op, 0, op.length())) {
                    return i;
                }
            }
        }
        return -1;
    }

    static Object resolve(Map<String, Object> row, String token) {
        String trimmed = token.trim();
        FederatedJoinCaseSupport.CaseExpr caseExpr = FederatedJoinCaseSupport.parseCase(trimmed);
        if (caseExpr != null) {
            return evaluateCase(row, caseExpr);
        }
        FederatedJoinCastSupport.CastCall cast = FederatedJoinCastSupport.parseCast(trimmed);
        if (cast != null) {
            return FederatedJoinCastSupport.applyCast(resolve(row, cast.expression()), cast.targetType());
        }
        FederatedJoinFunctionSupport.FunctionCall call = FederatedJoinFunctionSupport.parseFunctionCall(trimmed);
        if (call != null) {
            return FederatedJoinFunctionSupport.applyFunction(row, call);
        }
        int concatIdx = findOperator(trimmed, "||");
        if (concatIdx >= 0) {
            Object left = resolve(row, trimmed.substring(0, concatIdx).trim());
            Object right = resolve(row, trimmed.substring(concatIdx + 2).trim());
            return FederatedJoinFunctionSupport.concatValues(left, right);
        }
        if (isLiteral(trimmed)) {
            return literalValue(trimmed);
        }
        if (row.containsKey(trimmed)) {
            return row.get(trimmed);
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(trimmed)) {
                return entry.getValue();
            }
            if (entry.getKey() != null && entry.getKey().toLowerCase(Locale.ROOT).equals(lower)) {
                return entry.getValue();
            }
        }
        return null;
    }

    static FederatedJoinCaseSupport.CaseExpr parseCase(String token) {
        return FederatedJoinCaseSupport.parseCase(token);
    }

    static Object evaluateCase(Map<String, Object> row, FederatedJoinCaseSupport.CaseExpr caseExpr) {
        boolean matched = matchesConjunct(row, caseExpr.predicate());
        return resolve(row, matched ? caseExpr.thenExpr() : caseExpr.elseExpr());
    }

    static FederatedJoinCastSupport.CastCall parseCast(String token) {
        return FederatedJoinCastSupport.parseCast(token);
    }

    static Object applyCast(Object value, String targetType) {
        return FederatedJoinCastSupport.applyCast(value, targetType);
    }

    static Object roundValue(Object value, Object scaleObj) {
        return FederatedJoinFunctionSupport.roundValue(value, scaleObj);
    }

    static Object ceilValue(Object value) {
        return FederatedJoinFunctionSupport.ceilValue(value);
    }

    static Object floorValue(Object value) {
        return FederatedJoinFunctionSupport.floorValue(value);
    }

    static Object extremumValue(List<Object> values, boolean greatest) {
        return FederatedJoinFunctionSupport.extremumValue(values, greatest);
    }

    static Object substringValue(Object source, Object startObj, Object lengthObj) {
        return FederatedJoinFunctionSupport.substringValue(source, startObj, lengthObj);
    }

    static FederatedJoinFunctionSupport.FunctionCall parseFunctionCall(String token) {
        return FederatedJoinFunctionSupport.parseFunctionCall(token);
    }

    static FederatedJoinFunctionSupport.FunctionCall parseUnaryStringFunction(String token) {
        return FederatedJoinFunctionSupport.parseUnaryStringFunction(token);
    }

    static List<String> splitFunctionArgs(String body) {
        return FederatedJoinFunctionSupport.splitFunctionArgs(body);
    }

    /** Leading whitespace strip matching {@link String#trim()} (chars {@code <= ' '}). */
    static String ltrim(String text) {
        int i = 0;
        while (i < text.length() && text.charAt(i) <= ' ') {
            i++;
        }
        return text.substring(i);
    }

    /** Trailing whitespace strip matching {@link String#trim()} (chars {@code <= ' '}). */
    static String rtrim(String text) {
        int i = text.length();
        while (i > 0 && text.charAt(i - 1) <= ' ') {
            i--;
        }
        return text.substring(0, i);
    }

    static boolean isLiteral(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        if ((token.startsWith("'") && token.endsWith("'"))
                || (token.startsWith("\"") && token.endsWith("\""))) {
            return true;
        }
        if ("null".equalsIgnoreCase(token) || "true".equalsIgnoreCase(token) || "false".equalsIgnoreCase(token)) {
            return true;
        }
        try {
            Double.parseDouble(token);
            return true;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    static Object literalValue(String token) {
        if ((token.startsWith("'") && token.endsWith("'"))
                || (token.startsWith("\"") && token.endsWith("\""))) {
            return token.substring(1, token.length() - 1);
        }
        if ("null".equalsIgnoreCase(token)) {
            return null;
        }
        if ("true".equalsIgnoreCase(token)) {
            return true;
        }
        if ("false".equalsIgnoreCase(token)) {
            return false;
        }
        try {
            if (token.contains(".")) {
                return Double.parseDouble(token);
            }
            return Long.parseLong(token);
        } catch (NumberFormatException ex) {
            return token;
        }
    }

    private static boolean compare(Object left, Object right, String op) {
        if ("=".equals(op)) {
            return eq(left, right);
        }
        if ("!=".equals(op) || "<>".equals(op)) {
            return !eq(left, right);
        }
        int cmp = compareValues(left, right);
        return switch (op) {
            case "<" -> cmp < 0;
            case "<=" -> cmp <= 0;
            case ">" -> cmp > 0;
            case ">=" -> cmp >= 0;
            default -> false;
        };
    }

    static boolean eq(Object left, Object right) {
        if (left == null || right == null) {
            return left == right;
        }
        if (left instanceof Number && right instanceof Number) {
            return Double.compare(((Number) left).doubleValue(), ((Number) right).doubleValue()) == 0;
        }
        return String.valueOf(left).equals(String.valueOf(right));
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    static int compareValues(Object left, Object right) {
        if (left == null || right == null) {
            throw new IllegalArgumentException("Cannot compare NULL in federated residual WHERE");
        }
        if (left instanceof Number && right instanceof Number) {
            return Double.compare(((Number) left).doubleValue(), ((Number) right).doubleValue());
        }
        if (left instanceof Comparable comparable && left.getClass().isInstance(right)) {
            return comparable.compareTo(right);
        }
        return String.valueOf(left).compareTo(String.valueOf(right));
    }

    private record Comparison(String left, String op, String right) {
    }
}
