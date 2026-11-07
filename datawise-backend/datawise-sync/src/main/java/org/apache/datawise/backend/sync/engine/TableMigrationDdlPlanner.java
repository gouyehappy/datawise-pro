package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.SQLException;
import java.util.Optional;

/** 迁移 DDL 策略：目标表创建与 TRUNCATE。 */
@Service
public class TableMigrationDdlPlanner {

    private static final Logger log = LoggerFactory.getLogger(TableMigrationDdlPlanner.class);

    private final ConnectorFacade connectorFacade;
    private final TableDetailService tableDetailService;

    public TableMigrationDdlPlanner(
            ConnectorFacade connectorFacade,
            TableDetailService tableDetailService
    ) {
        this.connectorFacade = connectorFacade;
        this.tableDetailService = tableDetailService;
    }

    public void createTargetTableIfMissing(
            ConnectionEntity source,
            ConnectionEntity target,
            String sourceDatabase,
            String targetDatabase,
            String tableName
    ) throws SQLException {
        Optional<TablePropertiesResult> targetProps = tryLoadProperties(tableName, target.getId(), targetDatabase);
        if (targetProps.isPresent()
                && targetProps.get().columns() != null
                && !targetProps.get().columns().isEmpty()) {
            return;
        }
        TablePropertiesResult sourceProps = tableDetailService.loadProperties(tableName, source.getId(), sourceDatabase);
        String ddl = connectorFacade.ddl().renderCreateDdl(
                sourceProps,
                source.getDbType(),
                target.getDbType(),
                targetDatabase,
                sourceDatabase
        );
        if (ddl == null || ddl.isBlank()) {
            throw new IllegalArgumentException("Cannot generate CREATE TABLE for: " + tableName);
        }
        connectorFacade.jdbc().executeUpdate(target, ddl, targetDatabase);
    }

    public void truncateTargetTable(ConnectionEntity target, String database, String tableName) throws SQLException {
        String sql = connectorFacade.dml().buildTruncateTable(target.getDbType(), database, tableName);
        connectorFacade.jdbc().executeUpdate(target, sql, database);
    }

    Optional<TablePropertiesResult> tryLoadProperties(String tableName, String connectionId, String database) {
        try {
            return Optional.ofNullable(tableDetailService.loadProperties(tableName, connectionId, database));
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(
                    log,
                    "Skip target metadata pre-check connectionId="
                            + connectionId
                            + " database="
                            + database
                            + " table="
                            + tableName,
                    ex
            );
            return Optional.empty();
        }
    }
}
