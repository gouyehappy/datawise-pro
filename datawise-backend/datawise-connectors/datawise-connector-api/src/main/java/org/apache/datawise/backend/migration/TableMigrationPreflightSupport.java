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

    private static final Pattern WATERMARK_NAME = Pattern.compile(
            "(?i)(updated?_?at|update_?time|modify_?time|gmt_?modified|last_?modified|changed_?at"
                    + "|created?_?at|create_?time|insert_?time|gmt_?create|event_?time|record_?time|ts)");

    private TableMigrationPreflightSupport() {
    }

    public record ColumnCompareResult(
            List<String> missingOnTarget,
            List<String> extraOnTarget) {
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

        return new ColumnCompareResult(missing, extra);
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
