package org.apache.datawise.backend.migration;

import org.apache.datawise.backend.domain.TableColumnDetail;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

/** 迁移预检：列对比、状态与增量字段推荐（纯逻辑，便于单测）。 */
public final class TableMigrationPreflightSupport {

    public static final String STATUS_READY = "ready";
    public static final String STATUS_WARN = "warn";
    public static final String STATUS_BLOCKED = "blocked";

    public static final String ISSUE_SOURCE_MISSING = "sourceTableMissing";
    public static final String ISSUE_TARGET_MISSING = "targetTableMissing";
    public static final String ISSUE_COLUMNS_MISSING = "columnsMissingOnTarget";
    public static final String ISSUE_EXTRA_COLUMNS = "extraColumnsOnTarget";
    public static final String ISSUE_TYPE_MISMATCH = "columnTypeMismatch";
    public static final String ISSUE_ATTRIBUTE_MISMATCH = "columnAttributeMismatch";

    private static final Pattern WATERMARK_NAME = Pattern.compile(
            "(?i)(updated?_?at|update_?time|modify_?time|gmt_?modified|last_?modified|changed_?at"
                    + "|created?_?at|create_?time|insert_?time|gmt_?create|event_?time|record_?time|ts)");

    private TableMigrationPreflightSupport() {
    }

    public record ColumnCompareResult(
            List<String> missingOnTarget,
            List<String> extraOnTarget,
            List<String> typeMismatches,
            List<String> attributeMismatches) {
        public ColumnCompareResult(List<String> missingOnTarget, List<String> extraOnTarget) {
            this(missingOnTarget, extraOnTarget, List.of(), List.of());
        }

        public ColumnCompareResult(
                List<String> missingOnTarget,
                List<String> extraOnTarget,
                List<String> typeMismatches) {
            this(missingOnTarget, extraOnTarget, typeMismatches, List.of());
        }
    }

    public record StatusResult(
            String status,
            List<String> issues) {
    }

    public static ColumnCompareResult compareColumns(
                                                     List<TableColumnDetail> sourceColumns,
                                                     List<TableColumnDetail> targetColumns) {
        Map<String, String> sourceNames = normalizeColumnNames(sourceColumns);
        Map<String, String> targetNames = normalizeColumnNames(targetColumns);
        Map<String, TableColumnDetail> sourceByName = indexColumns(sourceColumns);
        Map<String, TableColumnDetail> targetByName = indexColumns(targetColumns);

        List<String> missing = sourceNames.keySet().stream()
                .filter(name -> !targetNames.containsKey(name))
                .map(sourceNames::get)
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();

        List<String> extra = targetNames.keySet().stream()
                .filter(name -> !sourceNames.containsKey(name))
                .map(targetNames::get)
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();

        List<String> typeMismatches = sourceNames.keySet().stream()
                .filter(targetNames::containsKey)
                .map(name -> describeTypeMismatch(sourceByName.get(name), targetByName.get(name)))
                .filter(label -> label != null && !label.isBlank())
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();

        List<String> attributeMismatches = sourceNames.keySet().stream()
                .filter(targetNames::containsKey)
                .map(name -> describeAttributeMismatch(sourceByName.get(name), targetByName.get(name)))
                .filter(label -> label != null && !label.isBlank())
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();

        return new ColumnCompareResult(missing, extra, typeMismatches, attributeMismatches);
    }

    /** 源表主键列名（按列顺序，大小写保留）。 */
    public static List<String> extractPrimaryKeyColumns(List<TableColumnDetail> columns) {
        if (columns == null || columns.isEmpty()) {
            return List.of();
        }
        List<String> primaryKeys = new ArrayList<>();
        for (TableColumnDetail column : columns) {
            if (column == null || column.name() == null || column.name().isBlank()) {
                continue;
            }
            if (isPrimaryKeyColumn(column)) {
                primaryKeys.add(column.name().trim());
            }
        }
        return List.copyOf(primaryKeys);
    }

    /** 推荐水位列：主键 → 时间类型/时间列名 → 自增数值列。 */
    public static List<String> suggestWatermarkColumns(List<TableColumnDetail> columns) {
        if (columns == null || columns.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> suggested = new LinkedHashSet<>();
        for (TableColumnDetail column : columns) {
            if (column == null || column.name() == null) {
                continue;
            }
            if (isPrimaryKeyColumn(column)) {
                suggested.add(column.name());
            }
        }
        for (TableColumnDetail column : columns) {
            if (column == null || column.name() == null) {
                continue;
            }
            if (isTemporalColumn(column)) {
                suggested.add(column.name());
            }
        }
        if (suggested.isEmpty()) {
            columns.stream()
                    .filter(TableMigrationPreflightSupport::isNumericIncrementalCandidate)
                    .map(TableColumnDetail::name)
                    .findFirst()
                    .ifPresent(suggested::add);
        }
        return List.copyOf(suggested);
    }

    public static StatusResult resolveStatus(
                                             boolean sourceExists,
                                             boolean targetExists,
                                             List<String> missingOnTarget,
                                             List<String> extraOnTarget) {
        return resolveStatus(sourceExists, targetExists, missingOnTarget, extraOnTarget, List.of());
    }

    public static StatusResult resolveStatus(
                                             boolean sourceExists,
                                             boolean targetExists,
                                             List<String> missingOnTarget,
                                             List<String> extraOnTarget,
                                             List<String> typeMismatches) {
        return resolveStatus(
                sourceExists, targetExists, missingOnTarget, extraOnTarget, typeMismatches, List.of());
    }

    public static StatusResult resolveStatus(
                                             boolean sourceExists,
                                             boolean targetExists,
                                             List<String> missingOnTarget,
                                             List<String> extraOnTarget,
                                             List<String> typeMismatches,
                                             List<String> attributeMismatches) {
        List<String> issues = new ArrayList<>();
        if (!sourceExists) {
            issues.add(ISSUE_SOURCE_MISSING);
            return new StatusResult(STATUS_BLOCKED, List.copyOf(issues));
        }
        if (!targetExists) {
            issues.add(ISSUE_TARGET_MISSING);
            return new StatusResult(STATUS_WARN, List.copyOf(issues));
        }
        if (missingOnTarget != null && !missingOnTarget.isEmpty()) {
            issues.add(ISSUE_COLUMNS_MISSING);
            return new StatusResult(STATUS_BLOCKED, List.copyOf(issues));
        }
        if (extraOnTarget != null && !extraOnTarget.isEmpty()) {
            issues.add(ISSUE_EXTRA_COLUMNS);
        }
        if (typeMismatches != null && !typeMismatches.isEmpty()) {
            issues.add(ISSUE_TYPE_MISMATCH);
        }
        if (attributeMismatches != null && !attributeMismatches.isEmpty()) {
            issues.add(ISSUE_ATTRIBUTE_MISMATCH);
        }
        if (!issues.isEmpty()) {
            return new StatusResult(STATUS_WARN, List.copyOf(issues));
        }
        return new StatusResult(STATUS_READY, List.of());
    }

    public static PreflightSummary summarizeStatuses(List<String> statuses) {
        int ready = 0;
        int warn = 0;
        int blocked = 0;
        for (String status : statuses) {
            if (STATUS_READY.equals(status)) {
                ready++;
            } else if (STATUS_WARN.equals(status)) {
                warn++;
            } else {
                blocked++;
            }
        }
        return new PreflightSummary(ready, warn, blocked, blocked == 0);
    }

    public record PreflightSummary(
            int readyCount,
            int warnCount,
            int blockedCount,
            boolean canProceed) {
    }

    private static Map<String, String> normalizeColumnNames(List<TableColumnDetail> columns) {
        if (columns == null || columns.isEmpty()) {
            return Map.of();
        }
        Map<String, String> normalized = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (TableColumnDetail column : columns) {
            if (column == null || column.name() == null || column.name().isBlank()) {
                continue;
            }
            normalized.putIfAbsent(column.name().trim().toLowerCase(Locale.ROOT), column.name().trim());
        }
        return normalized;
    }

    private static Map<String, TableColumnDetail> indexColumns(List<TableColumnDetail> columns) {
        if (columns == null || columns.isEmpty()) {
            return Map.of();
        }
        Map<String, TableColumnDetail> indexed = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (TableColumnDetail column : columns) {
            if (column == null || column.name() == null || column.name().isBlank()) {
                continue;
            }
            indexed.putIfAbsent(column.name().trim().toLowerCase(Locale.ROOT), column);
        }
        return indexed;
    }

    /**
     * Human-readable mismatch label for API / UI, e.g. {@code name: varchar(32) -> varchar(64)}.
     * Returns null when types (and nullability) match.
     */
    static String describeTypeMismatch(TableColumnDetail source, TableColumnDetail target) {
        if (source == null || target == null || source.name() == null || source.name().isBlank()) {
            return null;
        }
        String sourceType = normalizeType(source.dataType());
        String targetType = normalizeType(target.dataType());
        boolean typeDiff = !sourceType.equals(targetType);
        boolean nullDiff = source.nullable() != target.nullable();
        if (!typeDiff && !nullDiff) {
            return null;
        }
        StringBuilder label = new StringBuilder(source.name().trim()).append(": ");
        label.append(displayType(source));
        label.append(" -> ");
        label.append(displayType(target));
        return label.toString();
    }

    /** Column name extracted from a {@link #describeTypeMismatch} / attribute label. */
    public static String typeMismatchColumnName(String label) {
        if (label == null || label.isBlank()) {
            return null;
        }
        int colon = label.indexOf(':');
        if (colon <= 0) {
            return label.trim();
        }
        return label.substring(0, colon).trim();
    }

    /**
     * Label for comment / default differences, e.g.
     * {@code name: comment 'a' -> 'b'; default 1 -> 2}. Returns null when attributes match.
     */
    static String describeAttributeMismatch(TableColumnDetail source, TableColumnDetail target) {
        if (source == null || target == null || source.name() == null || source.name().isBlank()) {
            return null;
        }
        boolean commentDiff = !normalizeAttr(source.comment()).equals(normalizeAttr(target.comment()));
        boolean defaultDiff = !normalizeAttr(source.defaultValue()).equals(normalizeAttr(target.defaultValue()));
        if (!commentDiff && !defaultDiff) {
            return null;
        }
        StringBuilder label = new StringBuilder(source.name().trim()).append(':');
        if (commentDiff) {
            label.append(" comment ")
                    .append(displayAttr(source.comment()))
                    .append(" -> ")
                    .append(displayAttr(target.comment()));
        }
        if (defaultDiff) {
            if (commentDiff) {
                label.append(';');
            }
            label.append(" default ")
                    .append(displayAttr(source.defaultValue()))
                    .append(" -> ")
                    .append(displayAttr(target.defaultValue()));
        }
        return label.toString();
    }

    private static String normalizeAttr(String value) {
        return value == null ? "" : value.trim();
    }

    private static String displayAttr(String value) {
        if (value == null || value.isBlank()) {
            return "(none)";
        }
        return "'" + value.trim().replace("'", "''") + "'";
    }

    private static String normalizeType(String dataType) {
        if (dataType == null || dataType.isBlank()) {
            return "";
        }
        return dataType.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private static String displayType(TableColumnDetail column) {
        String type = column.dataType() != null && !column.dataType().isBlank()
                ? column.dataType().trim()
                : "?";
        return type + (column.nullable() ? " NULL" : " NOT NULL");
    }

    private static boolean isPrimaryKeyColumn(TableColumnDetail column) {
        String keyType = column.keyType() != null ? column.keyType().trim().toUpperCase(Locale.ROOT) : "";
        return "PRI".equals(keyType) || "PK".equals(keyType);
    }

    private static boolean isTemporalColumn(TableColumnDetail column) {
        if (column.name() != null && WATERMARK_NAME.matcher(column.name()).matches()) {
            return true;
        }
        return isTemporalDataType(column.dataType());
    }

    private static boolean isTemporalDataType(String dataType) {
        if (dataType == null || dataType.isBlank()) {
            return false;
        }
        String normalized = dataType.toLowerCase(Locale.ROOT);
        return normalized.contains("timestamp")
                || normalized.contains("datetime")
                || normalized.contains("date")
                || normalized.contains("time");
    }

    private static boolean isNumericIncrementalCandidate(TableColumnDetail column) {
        if (column == null || column.autoIncrement()) {
            return column != null && column.autoIncrement();
        }
        String dataType = column.dataType() != null ? column.dataType().toLowerCase(Locale.ROOT) : "";
        return dataType.contains("int") || dataType.contains("serial") || dataType.contains("bigint");
    }
}
