package org.apache.datawise.backend.database.federated;

import org.apache.datawise.sqlparser.SqlTransformOps;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinPlan;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinStep;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.FederatedViewSource;
import org.apache.datawise.backend.sql.spi.SqlPaginationService;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** 在各源执行子查询后在内存中执行联邦 JOIN。 */
final class FederatedJoinExecutor {

    private FederatedJoinExecutor() {
    }

    static ExecuteSqlResult execute(
            String viewSql,
            FederatedJoinPlan plan,
            Map<String, FederatedViewSource> sourceByAlias,
            SqlService sqlService,
            int maxRows
    ) {
        return execute(viewSql, plan, sourceByAlias, sqlService, maxRows, 0, Map.of(), null);
    }

    static ExecuteSqlResult execute(
            String viewSql,
            FederatedJoinPlan plan,
            Map<String, FederatedViewSource> sourceByAlias,
            SqlService sqlService,
            int maxRows,
            int offset,
            Map<String, String> dbTypeByAlias,
            SqlPaginationService paginationService
    ) {
        int resolvedMaxRows = FederatedJoinLimits.resolveMaxRows(maxRows);
        int resolvedOffset = FederatedJoinLimits.resolveOffset(offset);
        FederatedJoinPredicatePushdown.PushdownResult pushdown = FederatedJoinPredicatePushdown.apply(plan);
        FederatedJoinPlan effectivePlan = pushdown.plan();

        Map<String, ExecuteSqlResult> partialResults = new LinkedHashMap<>();
        long totalDuration = 0L;
        boolean sourceTruncated = false;
        for (FederatedJoinStep step : effectivePlan.steps()) {
            if (partialResults.containsKey(step.sourceAlias())) {
                continue;
            }
            FederatedViewSource source = requireSource(sourceByAlias, step.sourceAlias());
            String subSql = step.subQuery();
            if (subSql == null || subSql.isBlank()) {
                subSql = SqlTransformOps.selectAllFrom(step.sourceAlias());
            }
            String dbType = dbTypeByAlias != null ? dbTypeByAlias.get(step.sourceAlias()) : null;
            subSql = FederatedSourceSqlSupport.applySourceWindow(
                    subSql,
                    dbType,
                    resolvedMaxRows,
                    resolvedOffset,
                    paginationService
            );
            ExecuteSqlResult partial = sqlService.execute(
                    subSql,
                    source.getConnectionId(),
                    source.getDatabase(),
                    resolvedMaxRows,
                    null
            );
            partialResults.put(step.sourceAlias(), partial);
            totalDuration += partial.durationMs();
            if (partial.rows() != null && partial.rows().size() >= resolvedMaxRows) {
                sourceTruncated = true;
            }
        }

        JoinOutcome outcome = joinRows(effectivePlan, partialResults, resolvedMaxRows);
        List<Map<String, Object>> filtered = FederatedJoinResidualFilter.apply(
                outcome.rows(),
                pushdown.residualWhere()
        );
        List<Map<String, Object>> outputColumns = buildOutputColumns(effectivePlan, filtered);
        List<Map<String, Object>> projectedRows = projectRows(effectivePlan, filtered, outputColumns);
        boolean truncated = sourceTruncated || outcome.truncated();

        return new ExecuteSqlResult(
                viewSql,
                projectedRows.size(),
                totalDuration,
                outputColumns,
                projectedRows,
                null,
                null,
                null,
                truncated ? Boolean.TRUE : null,
                resolvedOffset > 0 ? resolvedOffset : null,
                resolvedMaxRows
        );
    }

    private static JoinOutcome joinRows(
            FederatedJoinPlan plan,
            Map<String, ExecuteSqlResult> partialResults,
            int maxRows
    ) {
        FederatedJoinStep first = plan.steps().get(0);
        ExecuteSqlResult firstResult = partialResults.get(first.sourceAlias());
        List<Map<String, Object>> current = prefixRows(
                firstResult.rows(),
                first.tableAlias(),
                firstResult.columns()
        );
        boolean truncated = false;

        for (int i = 1; i < plan.steps().size(); i++) {
            FederatedJoinStep step = plan.steps().get(i);
            ExecuteSqlResult rightResult = partialResults.get(step.sourceAlias());
            List<Map<String, Object>> rightRows = prefixRows(
                    rightResult.rows(),
                    step.tableAlias(),
                    rightResult.columns()
            );
            JoinOutcome stepOutcome = innerJoin(current, rightRows, step.onCondition(), maxRows);
            current = stepOutcome.rows();
            truncated = truncated || stepOutcome.truncated();
            if (truncated && current.size() >= maxRows) {
                break;
            }
        }
        return new JoinOutcome(current, truncated);
    }

    private static JoinOutcome innerJoin(
            List<Map<String, Object>> leftRows,
            List<Map<String, Object>> rightRows,
            String onCondition,
            int maxRows
    ) {
        List<String[]> eqPairs = parseEqualityPairs(onCondition);
        if (eqPairs.isEmpty()) {
            return crossJoin(leftRows, rightRows, maxRows);
        }
        return hashJoin(leftRows, rightRows, eqPairs, maxRows);
    }

    private static JoinOutcome crossJoin(
            List<Map<String, Object>> leftRows,
            List<Map<String, Object>> rightRows,
            int maxRows
    ) {
        long product = (long) leftRows.size() * (long) rightRows.size();
        if (product > FederatedJoinLimits.MAX_CROSS_PRODUCT) {
            throw new IllegalArgumentException(
                    "Federated cross JOIN product too large ("
                            + leftRows.size() + " × " + rightRows.size()
                            + "). Add ON equality predicates, reduce source filters, or lower maxRows "
                            + "(hard cap " + FederatedJoinLimits.HARD_MAX_ROWS + ")."
            );
        }
        List<Map<String, Object>> joined = new ArrayList<>();
        for (Map<String, Object> left : leftRows) {
            for (Map<String, Object> right : rightRows) {
                Map<String, Object> combined = new LinkedHashMap<>(left);
                combined.putAll(right);
                joined.add(combined);
                if (joined.size() >= maxRows) {
                    return new JoinOutcome(joined, true);
                }
            }
        }
        return new JoinOutcome(joined, false);
    }

    private static JoinOutcome hashJoin(
            List<Map<String, Object>> leftRows,
            List<Map<String, Object>> rightRows,
            List<String[]> eqPairs,
            int maxRows
    ) {
        return hashJoin(leftRows, rightRows, eqPairs, maxRows, FederatedJoinLimits.MEMORY_HASH_BUILD_ROWS);
    }

    /** Package-visible for tests; {@code spillThreshold} forces Grace spill when build side is larger. */
    static JoinOutcome hashJoin(
            List<Map<String, Object>> leftRows,
            List<Map<String, Object>> rightRows,
            List<String[]> eqPairs,
            int maxRows,
            int spillThreshold
    ) {
        boolean buildRight = rightRows.size() <= leftRows.size();
        List<Map<String, Object>> buildRows = buildRight ? rightRows : leftRows;

        if (buildRows.size() > Math.max(0, spillThreshold)) {
            return FederatedJoinSpillSupport.hashJoinWithSpill(
                    leftRows,
                    rightRows,
                    eqPairs,
                    maxRows,
                    (row, useRightSide) -> buildJoinKey(row, eqPairs, useRightSide)
            );
        }

        List<Map<String, Object>> probeRows = buildRight ? leftRows : rightRows;
        Map<Object, List<Map<String, Object>>> index = new HashMap<>();
        for (Map<String, Object> row : buildRows) {
            Object key = buildJoinKey(row, eqPairs, buildRight);
            if (key == null) {
                continue;
            }
            index.computeIfAbsent(key, ignored -> new ArrayList<>()).add(row);
        }

        List<Map<String, Object>> joined = new ArrayList<>();
        for (Map<String, Object> probe : probeRows) {
            Object key = buildJoinKey(probe, eqPairs, !buildRight);
            if (key == null) {
                continue;
            }
            List<Map<String, Object>> matches = index.get(key);
            if (matches == null) {
                continue;
            }
            for (Map<String, Object> build : matches) {
                Map<String, Object> combined = new LinkedHashMap<>();
                if (buildRight) {
                    combined.putAll(probe);
                    combined.putAll(build);
                } else {
                    combined.putAll(build);
                    combined.putAll(probe);
                }
                joined.add(combined);
                if (joined.size() >= maxRows) {
                    return new JoinOutcome(joined, true);
                }
            }
        }
        return new JoinOutcome(joined, false);
    }

    private static Object buildJoinKey(Map<String, Object> row, List<String[]> eqPairs, boolean useRightSide) {
        if (eqPairs.size() == 1) {
            String[] pair = eqPairs.get(0);
            Object value = resolveRef(row, useRightSide ? pair[1] : pair[0]);
            return normalizeValue(value);
        }
        List<Object> parts = new ArrayList<>(eqPairs.size());
        for (String[] pair : eqPairs) {
            Object value = resolveRef(row, useRightSide ? pair[1] : pair[0]);
            Object normalized = normalizeValue(value);
            if (normalized == null) {
                return null;
            }
            parts.add(normalized);
        }
        return parts;
    }

    /** Parses {@code a = b AND c = d} into left/right ref pairs. */
    static List<String[]> parseEqualityPairs(String onCondition) {
        List<String[]> pairs = new ArrayList<>();
        if (onCondition == null || onCondition.isBlank()) {
            return pairs;
        }
        String[] conditions = onCondition.split("(?i)\\band\\b");
        for (String condition : conditions) {
            String trimmed = condition.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            int eqIdx = findEqualityOperator(trimmed);
            if (eqIdx < 0) {
                throw new IllegalArgumentException("unsupported JOIN condition: " + condition);
            }
            String leftRef = trimmed.substring(0, eqIdx).trim();
            String rightRef = trimmed.substring(eqIdx + 1).trim();
            pairs.add(new String[]{leftRef, rightRef});
        }
        return pairs;
    }

    private static int findEqualityOperator(String condition) {
        int depth = 0;
        for (int i = 0; i < condition.length(); i++) {
            char ch = condition.charAt(i);
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                depth = Math.max(0, depth - 1);
            } else if (depth == 0 && ch == '=') {
                return i;
            }
        }
        return -1;
    }

    private static Object resolveRef(Map<String, Object> row, String ref) {
        if (ref == null || ref.isBlank()) {
            return null;
        }
        String normalized = ref.trim();
        if (row.containsKey(normalized)) {
            return row.get(normalized);
        }
        int dot = normalized.indexOf('.');
        if (dot > 0 && dot < normalized.length() - 1) {
            String prefixed = normalized.substring(0, dot) + "." + normalized.substring(dot + 1);
            if (row.containsKey(prefixed)) {
                return row.get(prefixed);
            }
        }
        return row.get(normalized.toLowerCase(Locale.ROOT));
    }

    private static Object normalizeValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return String.valueOf(value);
    }

    private static List<Map<String, Object>> prefixRows(
            List<Map<String, Object>> rows,
            String tableAlias,
            List<Map<String, Object>> columns
    ) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> prefixedRows = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            prefixedRows.add(prefixRow(row, tableAlias, columns));
        }
        return prefixedRows;
    }

    private static Map<String, Object> prefixRow(
            Map<String, Object> row,
            String tableAlias,
            List<Map<String, Object>> columns
    ) {
        Map<String, Object> prefixed = new LinkedHashMap<>();
        if (columns != null) {
            for (Map<String, Object> column : columns) {
                String key = columnKey(column);
                if (key == null) {
                    continue;
                }
                prefixed.put(tableAlias + "." + key, row.get(key));
            }
            return prefixed;
        }
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            prefixed.put(tableAlias + "." + entry.getKey(), entry.getValue());
        }
        return prefixed;
    }

    private static List<Map<String, Object>> buildOutputColumns(
            FederatedJoinPlan plan,
            List<Map<String, Object>> joinedRows
    ) {
        Set<String> keys = new LinkedHashSet<>();
        if (plan.selectItems().size() == 1 && "*".equals(plan.selectItems().get(0))) {
            if (!joinedRows.isEmpty()) {
                keys.addAll(joinedRows.get(0).keySet());
            } else {
                for (FederatedJoinStep step : plan.steps()) {
                    keys.add(step.tableAlias() + ".*");
                }
            }
        } else {
            for (String item : plan.selectItems()) {
                keys.add(item.trim());
            }
        }
        List<Map<String, Object>> columns = new ArrayList<>();
        for (String key : keys) {
            Map<String, Object> column = new LinkedHashMap<>();
            column.put("name", key);
            column.put("key", key);
            columns.add(column);
        }
        return columns;
    }

    private static List<Map<String, Object>> projectRows(
            FederatedJoinPlan plan,
            List<Map<String, Object>> joinedRows,
            List<Map<String, Object>> outputColumns
    ) {
        List<Map<String, Object>> projected = new ArrayList<>();
        for (Map<String, Object> row : joinedRows) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map<String, Object> column : outputColumns) {
                String key = columnKey(column);
                if (key == null) {
                    continue;
                }
                if ("*".equals(key) || key.endsWith(".*")) {
                    for (Map.Entry<String, Object> entry : row.entrySet()) {
                        if (key.endsWith(".*")) {
                            String prefix = key.substring(0, key.length() - 1);
                            if (entry.getKey().startsWith(prefix)) {
                                out.put(entry.getKey(), entry.getValue());
                            }
                        } else {
                            out.put(entry.getKey(), entry.getValue());
                        }
                    }
                } else {
                    out.put(key, resolveRef(row, key));
                }
            }
            projected.add(out);
        }
        return projected;
    }

    private static String columnKey(Map<String, Object> column) {
        if (column == null) {
            return null;
        }
        Object key = column.get("key") != null ? column.get("key") : column.get("name");
        return key != null ? String.valueOf(key) : null;
    }

    private static FederatedViewSource requireSource(Map<String, FederatedViewSource> sourceByAlias, String alias) {
        FederatedViewSource source = sourceByAlias.get(alias);
        if (source == null) {
            throw new IllegalArgumentException("unknown source alias: " + alias);
        }
        return source;
    }

    record JoinOutcome(List<Map<String, Object>> rows, boolean truncated) {
    }
}
