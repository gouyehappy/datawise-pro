package org.apache.datawise.backend.sync.preflight;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.sync.job.MigrationRowCountEstimator;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableMigrationPreflightTableResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.migration.TableMigrationPreflightSupport;
import org.apache.datawise.backend.migration.TableMigrationPreflightSupport.ColumnCompareResult;
import org.apache.datawise.backend.migration.TableMigrationPreflightSupport.StatusResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/** 迁移预检：元数据、列兼容性与跨方言 DDL 预览。 */
@Service
public class MigrationCompatibilityChecker {

    private static final Logger log = LoggerFactory.getLogger(MigrationCompatibilityChecker.class);

    private final TableDetailService tableDetailService;
    private final ConnectorFacade connectorFacade;
    private final MigrationRowCountEstimator rowCountEstimator;

    public MigrationCompatibilityChecker(
            TableDetailService tableDetailService,
            ConnectorFacade connectorFacade,
            MigrationRowCountEstimator rowCountEstimator
    ) {
        this.tableDetailService = tableDetailService;
        this.connectorFacade = connectorFacade;
        this.rowCountEstimator = rowCountEstimator;
    }

    public TableMigrationPreflightTableResult checkTable(
            ConnectionEntity source,
            String sourceDatabase,
            ConnectionEntity target,
            String targetDatabase,
            String tableName,
            String whereClause
    ) {
        TablePropertiesResult sourceProps = tryLoadProperties(tableName, source, sourceDatabase);
        TablePropertiesResult targetProps = tryLoadProperties(tableName, target, targetDatabase);

        boolean sourceExists = sourceProps != null && hasColumns(sourceProps);
        boolean targetExists = targetProps != null && hasColumns(targetProps);

        List<TableColumnDetail> sourceColumns = sourceExists ? sourceProps.columns() : List.of();
        List<TableColumnDetail> targetColumns = targetExists ? targetProps.columns() : List.of();

        ColumnCompareResult compare = TableMigrationPreflightSupport.compareColumns(sourceColumns, targetColumns);
        StatusResult status = TableMigrationPreflightSupport.resolveStatus(
                sourceExists,
                targetExists,
                compare.missingOnTarget(),
                compare.extraOnTarget()
        );

        Long sourceRows = sourceExists
                ? rowCountEstimator.countRowsSafe(source, sourceDatabase, tableName, whereClause)
                : null;
        Long targetRows = targetExists
                ? rowCountEstimator.countRowsSafe(target, targetDatabase, tableName, null)
                : null;

        List<String> watermarkColumns = TableMigrationPreflightSupport.suggestWatermarkColumns(sourceColumns);
        List<String> primaryKeyColumns = TableMigrationPreflightSupport.extractPrimaryKeyColumns(sourceColumns);

        var ddlPreview = sourceExists && sourceProps != null
                ? connectorFacade.ddl().preview(
                    sourceProps,
                    source.getDbType(),
                    target.getDbType(),
                    targetDatabase,
                    sourceDatabase
            )
                : null;

        return new TableMigrationPreflightTableResult(
                tableName,
                sourceExists,
                targetExists,
                sourceRows,
                targetRows,
                sourceColumns.size(),
                targetColumns.size(),
                compare.missingOnTarget(),
                compare.extraOnTarget(),
                watermarkColumns,
                primaryKeyColumns,
                status.status(),
                status.issues(),
                ddlPreview != null ? ddlPreview.columnMappings() : List.of(),
                targetExists ? null : (ddlPreview != null ? ddlPreview.suggestedCreateDdl() : null),
                ddlPreview != null ? ddlPreview.warnings() : List.of()
        );
    }

    private TablePropertiesResult tryLoadProperties(
            String tableName,
            ConnectionEntity entity,
            String database
    ) {
        try {
            TablePropertiesResult properties = tableDetailService.loadProperties(
                    tableName,
                    entity.getId(),
                    database
            );
            return hasColumns(properties) ? properties : null;
        } catch (RuntimeException ex) {
            if (isMissingTableError(ex)) {
                ExceptionLogging.recoverable(
                        log,
                        "migration.preflight.tableMissing table=" + tableName
                                + " connectionId=" + entity.getId()
                                + " database=" + database,
                        ex
                );
                return null;
            }
            ExceptionLogging.error(
                    log,
                    "migration.preflight.metadata.failed table=" + tableName
                            + " connectionId=" + entity.getId()
                            + " database=" + database,
                    ex
            );
            throw ex;
        }
    }

    private static boolean hasColumns(TablePropertiesResult properties) {
        return properties != null
                && properties.columns() != null
                && !properties.columns().isEmpty();
    }

    private static boolean isMissingTableError(RuntimeException ex) {
        Throwable current = ex;
        while (current != null) {
            String message = current.getMessage();
            if (message != null) {
                String lower = message.toLowerCase();
                if (lower.contains("doesn't exist")
                        || lower.contains("does not exist")
                        || lower.contains("unknown table")
                        || lower.contains("not found")) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }
}
