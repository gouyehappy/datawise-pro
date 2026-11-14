package org.apache.datawise.backend.sync.preflight;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.table.TableDataSupport;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.TableMigrationRowDiffItem;
import org.apache.datawise.backend.domain.TableMigrationRowDiffRequest;
import org.apache.datawise.backend.domain.TableMigrationRowDiffResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.jdbc.support.MigrationWhereSupport;
import org.apache.datawise.backend.migration.TableMigrationRowDiffSupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.UserAccountService;
import org.apache.datawise.backend.sync.support.MigrationSupport;
import org.apache.datawise.sqlparser.SqlTransformOps;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Samples source rows and classifies PK-based insert/update/unchanged against the target table.
 */
@Service
public class TableMigrationRowDiffService {

    private static final Logger log = LoggerFactory.getLogger(TableMigrationRowDiffService.class);

    static final int DEFAULT_SAMPLE_LIMIT = 50;
    static final int HARD_SAMPLE_MAX = 200;
    static final int MAX_SAMPLE_ITEMS = 40;

    private final ConnectionExecutionContext connectionContext;
    private final UserAccountService userAccountService;
    private final TableDetailService tableDetailService;
    private final ConnectorFacade connectorFacade;

    public TableMigrationRowDiffService(
            ConnectionExecutionContext connectionContext,
            UserAccountService userAccountService,
            TableDetailService tableDetailService,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.userAccountService = userAccountService;
        this.tableDetailService = tableDetailService;
        this.connectorFacade = connectorFacade;
    }

    public TableMigrationRowDiffResult diff(TableMigrationRowDiffRequest request) {
        validate(request);
        long userId = userAccountService.requireUserId();
        ConnectionEntity source = MigrationSupport.requireConnection(
                connectionContext, userId, request.sourceConnectionId()
        );
        ConnectionEntity target = MigrationSupport.requireConnection(
                connectionContext, userId, request.targetConnectionId()
        );
        String sourceDatabase = MigrationSupport.requireDatabase(source, request.sourceDatabase());
        String targetDatabase = MigrationSupport.requireDatabase(target, request.targetDatabase());
        MigrationSupport.requireDistinctScopes(
                request.sourceConnectionId(),
                sourceDatabase,
                request.targetConnectionId(),
                targetDatabase
        );

        String tableName = request.tableName().trim();
        TablePropertiesResult sourceProps = tableDetailService.loadProperties(
                tableName, source.getId(), sourceDatabase
        );
        List<String> pkColumns = TableDataSupport.primaryKeyColumns(sourceProps);
        if (pkColumns.isEmpty()) {
            return emptyResult(tableName, List.of(), "PK row diff requires a primary key on the source table");
        }

        TablePropertiesResult targetProps;
        try {
            targetProps = tableDetailService.loadProperties(tableName, target.getId(), targetDatabase);
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(
                    log,
                    "migration.rowDiff.targetMetadata.failed table=" + tableName
                            + " targetConnectionId=" + target.getId(),
                    ex
            );
            return emptyResult(tableName, pkColumns, "Target table is missing; all sampled source rows would INSERT");
        }
        if (targetProps == null || targetProps.columns() == null || targetProps.columns().isEmpty()) {
            return emptyResult(tableName, pkColumns, "Target table is missing; all sampled source rows would INSERT");
        }

        int sampleLimit = TableMigrationRowDiffSupport.clampSampleLimit(
                request.sampleLimit(), DEFAULT_SAMPLE_LIMIT, HARD_SAMPLE_MAX
        );
        MigrationWhereSupport.validate(request.whereClause());

        String baseSelect = SqlTransformOps.buildSelectAll(source.getDbType(), sourceDatabase, tableName);
        String selectSql = MigrationWhereSupport.appendWhere(baseSelect, request.whereClause());
        ExecuteSqlResult sourcePage;
        try {
            sourcePage = connectorFacade.jdbc().executeSelectPage(
                    source, selectSql, sourceDatabase, sampleLimit, 0
            );
        } catch (SQLException ex) {
            throw new IllegalArgumentException("Failed to sample source rows: " + ex.getMessage(), ex);
        }

        List<Map<String, Object>> sourceRows = sourcePage.rows() != null ? sourcePage.rows() : List.of();
        List<String> compareColumns = TableDataSupport.columnNames(sourceProps);
        int insertCount = 0;
        int updateCount = 0;
        int unchangedCount = 0;
        List<TableMigrationRowDiffItem> samples = new ArrayList<>();

        for (Map<String, Object> sourceRow : sourceRows) {
            Map<String, Object> targetRow = lookupTargetRow(
                    target, targetDatabase, tableName, pkColumns, sourceRow
            );
            var diff = TableMigrationRowDiffSupport.compareRows(
                    sourceRow, targetRow, pkColumns, compareColumns
            );
            switch (diff.kind()) {
                case TableMigrationRowDiffSupport.KIND_INSERT -> insertCount++;
                case TableMigrationRowDiffSupport.KIND_UPDATE -> updateCount++;
                default -> unchangedCount++;
            }
            if (samples.size() < MAX_SAMPLE_ITEMS
                    && !TableMigrationRowDiffSupport.KIND_UNCHANGED.equals(diff.kind())) {
                Map<String, Object> pk = TableMigrationRowDiffSupport.extractPrimaryKey(sourceRow, pkColumns);
                List<String> previewCols = TableMigrationRowDiffSupport.KIND_INSERT.equals(diff.kind())
                        ? compareColumns
                        : previewColumns(pkColumns, diff.changedColumns());
                samples.add(new TableMigrationRowDiffItem(
                        diff.kind(),
                        pk,
                        diff.changedColumns(),
                        projectColumns(sourceRow, previewCols),
                        targetRow == null
                                ? null
                                : projectColumns(targetRow, previewCols)
                ));
            }
        }

        boolean truncated = Boolean.TRUE.equals(sourcePage.hasMore()) || sourceRows.size() >= sampleLimit;
        List<TableMigrationRowDiffItem> sampleList = List.copyOf(samples);
        String syncSql = TableMigrationRowDiffSupport.renderSampleSyncSql(
                target.getDbType(),
                targetDatabase,
                tableName,
                pkColumns,
                sampleList
        );
        return new TableMigrationRowDiffResult(
                tableName,
                pkColumns,
                sourceRows.size(),
                insertCount,
                updateCount,
                unchangedCount,
                truncated,
                truncated
                        ? "Sample capped at " + sampleLimit + " source rows; counts are preview-only"
                        : null,
                sampleList,
                syncSql
        );
    }

    private Map<String, Object> lookupTargetRow(
            ConnectionEntity target,
            String targetDatabase,
            String tableName,
            List<String> pkColumns,
            Map<String, Object> sourceRow
    ) {
        String baseSelect = SqlTransformOps.buildSelectAll(target.getDbType(), targetDatabase, tableName);
        String where = buildPkWhere(pkColumns, sourceRow);
        String sql = baseSelect + " WHERE " + where;
        try {
            ExecuteSqlResult result = connectorFacade.jdbc().execute(target, sql, targetDatabase, 2);
            if (result.rows() == null || result.rows().isEmpty()) {
                return null;
            }
            return result.rows().get(0);
        } catch (SQLException ex) {
            throw new IllegalArgumentException("Failed to lookup target row: " + ex.getMessage(), ex);
        }
    }

    static String buildPkWhere(List<String> pkColumns, Map<String, Object> sourceRow) {
        StringBuilder sb = new StringBuilder();
        Map<String, Object> pk = TableMigrationRowDiffSupport.extractPrimaryKey(sourceRow, pkColumns);
        for (String column : pkColumns) {
            if (sb.length() > 0) {
                sb.append(" AND ");
            }
            sb.append(sanitizeIdentifier(column)).append('=').append(sqlLiteral(pk.get(column)));
        }
        return sb.toString();
    }

    private static String sanitizeIdentifier(String column) {
        String trimmed = column.trim();
        if (!trimmed.matches("[A-Za-z0-9_$.]+")) {
            throw new IllegalArgumentException("invalid column name: " + column);
        }
        return trimmed;
    }

    private static String sqlLiteral(Object value) {
        if (value == null) {
            return "NULL";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        String text = String.valueOf(value);
        return "'" + text.replace("'", "''") + "'";
    }

    private static List<String> previewColumns(List<String> pkColumns, List<String> changedColumns) {
        List<String> cols = new ArrayList<>(pkColumns);
        if (changedColumns != null) {
            for (String column : changedColumns) {
                if (column != null && !cols.contains(column)) {
                    cols.add(column);
                }
            }
        }
        return cols;
    }

    private static Map<String, Object> projectColumns(Map<String, Object> row, List<String> columns) {
        Map<String, Object> projected = new LinkedHashMap<>();
        for (String column : columns) {
            Object value = null;
            if (row.containsKey(column)) {
                value = row.get(column);
            } else {
                String needle = column.toLowerCase(Locale.ROOT);
                for (Map.Entry<String, Object> entry : row.entrySet()) {
                    if (entry.getKey() != null && entry.getKey().toLowerCase(Locale.ROOT).equals(needle)) {
                        value = entry.getValue();
                        break;
                    }
                }
            }
            projected.put(column, value);
        }
        return projected;
    }

    private static TableMigrationRowDiffResult emptyResult(
            String tableName,
            List<String> pkColumns,
            String message
    ) {
        return new TableMigrationRowDiffResult(
                tableName,
                pkColumns,
                0,
                0,
                0,
                0,
                false,
                message,
                List.of()
        );
    }

    private static void validate(TableMigrationRowDiffRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("request is required");
        }
        if (request.sourceConnectionId() == null || request.sourceConnectionId().isBlank()) {
            throw new IllegalArgumentException("sourceConnectionId is required");
        }
        if (request.targetConnectionId() == null || request.targetConnectionId().isBlank()) {
            throw new IllegalArgumentException("targetConnectionId is required");
        }
        if (request.tableName() == null || request.tableName().isBlank()) {
            throw new IllegalArgumentException("tableName is required");
        }
    }
}
