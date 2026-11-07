package org.apache.datawise.backend.sync.job;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.SQLException;

/** 迁移预检行数估算（失败时返回 null，不阻断预检）。 */
@Service
public class MigrationRowCountEstimator {

    private static final Logger log = LoggerFactory.getLogger(MigrationRowCountEstimator.class);

    private final ConnectorFacade connectorFacade;

    public MigrationRowCountEstimator(ConnectorFacade connectorFacade) {
        this.connectorFacade = connectorFacade;
    }

    public Long countRowsSafe(
            ConnectionEntity entity,
            String database,
            String tableName,
            String whereClause
    ) {
        try {
            return connectorFacade.jdbc().countTableRows(entity, tableName, database, whereClause);
        } catch (SQLException ex) {
            ExceptionLogging.recoverable(
                    log,
                    "migration.rowCount.estimate.failed connectionId="
                            + (entity != null ? entity.getId() : null)
                            + " table="
                            + tableName,
                    ex
            );
            return null;
        }
    }
}
