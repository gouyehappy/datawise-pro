package org.apache.datawise.backend.database.federated;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 解析带 {@code JOIN} 的联邦视图 SQL（{@code @alias} 占位符 + 表别名）。 */
public final class FederatedJoinSqlParser {

    private static final Pattern SELECT_FROM = Pattern.compile(
            "(?is)\\bSELECT\\s+(.+?)\\s+FROM\\s+(.+)"
    );
    private static final Pattern ON_CLAUSE = Pattern.compile(
            "(?is)\\bON\\s+(.+)$"
    );
    private static final Pattern SOURCE_ALIAS = Pattern.compile(
            "@([a-zA-Z]\\w*)\\s+([a-zA-Z]\\w*)"
    );
    private static final Pattern TRAILING_CLAUSE = Pattern.compile(
            "(?i)\\b(WHERE|GROUP\\s+BY|ORDER\\s+BY|HAVING|LIMIT)\\b"
    );

    private FederatedJoinSqlParser() {
    }

    public static FederatedJoinPlan parse(String sql) {
        if (sql == null || sql.isBlank()) {
            throw new IllegalArgumentException("federated SQL is required");
        }
        Matcher selectMatcher = SELECT_FROM.matcher(sql.trim());
        if (!selectMatcher.find()) {
            throw new IllegalArgumentException("federated JOIN SQL must include SELECT and FROM");
        }
        String selectClause = selectMatcher.group(1).trim();
        String fromAndJoins = selectMatcher.group(2).trim();

        TrailingClauses trailing = splitTrailingClauses(fromAndJoins);
        fromAndJoins = trailing.body();

        int joinIdx = indexOfJoinKeyword(fromAndJoins);
        String fromSegment = joinIdx >= 0 ? fromAndJoins.substring(0, joinIdx).trim() : fromAndJoins;
        String joinTail = joinIdx >= 0 ? fromAndJoins.substring(joinIdx).trim() : "";

        List<FederatedJoinStep> steps = new ArrayList<>();
        steps.add(parseSourceStep(fromSegment, null));

        if (!joinTail.isBlank()) {
            String[] joinParts = joinTail.split("(?i)\\bJOIN\\b");
            for (String part : joinParts) {
                String segment = part.trim();
                if (segment.isEmpty()) {
                    continue;
                }
                Matcher onMatcher = ON_CLAUSE.matcher(segment);
                if (!onMatcher.find()) {
                    throw new IllegalArgumentException("JOIN requires ON condition: " + segment);
                }
                String onCondition = onMatcher.group(1).trim();
                String sourceSegment = segment.substring(0, onMatcher.start()).trim();
                steps.add(parseSourceStep(sourceSegment, onCondition));
            }
        }

        if (steps.size() < 2) {
            throw new IllegalArgumentException("federated JOIN SQL requires at least two sources");
        }

        List<String> selectItems = parseSelectItems(selectClause);
        return new FederatedJoinPlan(selectItems, steps, trailing.where());
    }

    static TrailingClauses splitTrailingClauses(String fromAndJoins) {
        if (fromAndJoins == null || fromAndJoins.isBlank()) {
            return new TrailingClauses("", null);
        }
        int cut = indexOfKeywordOutsideParens(fromAndJoins, TRAILING_CLAUSE);
        if (cut < 0) {
            return new TrailingClauses(fromAndJoins.trim(), null);
        }
        String body = fromAndJoins.substring(0, cut).trim();
        String tail = fromAndJoins.substring(cut).trim();
        String where = null;
        Matcher whereMatcher = Pattern.compile("(?is)^WHERE\\s+(.+?)(?=\\s+\\b(?:GROUP\\s+BY|ORDER\\s+BY|HAVING|LIMIT)\\b|$)")
                .matcher(tail);
        if (whereMatcher.find()) {
            where = whereMatcher.group(1).trim();
            if (where.isEmpty()) {
                where = null;
            }
        }
        return new TrailingClauses(body, where);
    }

    private static int indexOfKeywordOutsideParens(String sql, Pattern keyword) {
        int depth = 0;
        for (int i = 0; i < sql.length(); ) {
            char ch = sql.charAt(i);
            if (ch == '(') {
                depth++;
                i++;
                continue;
            }
            if (ch == ')') {
                depth = Math.max(0, depth - 1);
                i++;
                continue;
            }
            if (depth == 0) {
                Matcher m = keyword.matcher(sql);
                m.region(i, sql.length());
                if (m.lookingAt()) {
                    return i;
                }
            }
            i++;
        }
        return -1;
    }

    private static int indexOfJoinKeyword(String sql) {
        Matcher matcher = Pattern.compile("(?i)\\bJOIN\\b").matcher(sql);
        return matcher.find() ? matcher.start() : -1;
    }

    private static FederatedJoinStep parseSourceStep(String segment, String onCondition) {
        FederatedSourceRef ref = parseSourceRef(segment, onCondition == null);
        String subQuery = FederatedSqlSubquerySupport.extractSubQuery(segment, ref.sourceAlias());
        if (subQuery == null) {
            subQuery = extractSubQueryFromSegment(segment, ref.sourceAlias());
        }
        return new FederatedJoinStep(ref.sourceAlias(), ref.tableAlias(), subQuery, onCondition);
    }

    private static FederatedSourceRef parseSourceRef(String segment, boolean fromClause) {
        Matcher matcher = SOURCE_ALIAS.matcher(segment);
        if (!matcher.find()) {
            throw new IllegalArgumentException(
                    (fromClause ? "FROM" : "JOIN") + " clause must reference @alias tableAlias: " + segment
            );
        }
        return new FederatedSourceRef(matcher.group(1), matcher.group(2));
    }

    private static String extractSubQueryFromSegment(String segment, String alias) {
        String marker = "@" + alias;
        int aliasIdx = segment.indexOf(marker);
        if (aliasIdx < 0) {
            return null;
        }
        int closeParen = aliasIdx > 0 ? segment.lastIndexOf(')', aliasIdx - 1) : -1;
        if (closeParen < 0) {
            return null;
        }
        int openParen = -1;
        int depth = 0;
        for (int i = closeParen; i >= 0; i--) {
            char ch = segment.charAt(i);
            if (ch == ')') {
                depth++;
            } else if (ch == '(') {
                depth--;
                if (depth == 0) {
                    openParen = i;
                    break;
                }
            }
        }
        if (openParen < 0) {
            return null;
        }
        return segment.substring(openParen + 1, closeParen).trim();
    }

    private static List<String> parseSelectItems(String selectClause) {
        if (selectClause.equals("*") || selectClause.equalsIgnoreCase("*")) {
            return List.of("*");
        }
        List<String> items = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int depth = 0;
        for (int i = 0; i < selectClause.length(); i++) {
            char ch = selectClause.charAt(i);
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                depth = Math.max(0, depth - 1);
            } else if (ch == ',' && depth == 0) {
                addSelectItem(items, current);
                current = new StringBuilder();
                continue;
            }
            current.append(ch);
        }
        addSelectItem(items, current);
        return items;
    }

    private static void addSelectItem(List<String> items, StringBuilder current) {
        String item = current.toString().trim();
        if (!item.isEmpty()) {
            items.add(item);
        }
    }

    record FederatedSourceRef(String sourceAlias, String tableAlias) {
    }

    record TrailingClauses(String body, String where) {
    }

    public record FederatedJoinStep(
            String sourceAlias,
            String tableAlias,
            String subQuery,
            String onCondition
    ) {
    }

    public record FederatedJoinPlan(
            List<String> selectItems,
            List<FederatedJoinStep> steps,
            String outerWhere
    ) {
        public FederatedJoinPlan(List<String> selectItems, List<FederatedJoinStep> steps) {
            this(selectItems, steps, null);
        }

        public FederatedJoinPlan {
            selectItems = selectItems == null ? List.of() : List.copyOf(selectItems);
            steps = steps == null ? List.of() : List.copyOf(steps);
            if (outerWhere != null && outerWhere.isBlank()) {
                outerWhere = null;
            }
        }
    }
}
