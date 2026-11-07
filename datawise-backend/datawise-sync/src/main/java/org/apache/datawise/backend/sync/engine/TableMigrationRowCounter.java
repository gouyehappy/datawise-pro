package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.SQLException;
import java.util.Optional;

/** 迁移行数统计；失败时降级为 empty，不阻断主流程。 */
@Component
public class TableMigrationRowCounter {

    private static final Logger log = LoggerFactory.getLogger(TableMigrationRowCounter.class);

    private final ConnectorFacade connectorFacade;

    public TableMigrationRowCounter(ConnectorFacade connectorFacade) {
        this.connectorFacade = connectorFacade;
    }

    public Optional<Long> tryCountRows(
            ConnectionEntity entity,
            String database,
            String tableName,
            String whereClause
    ) {
        try {
            return Optional.ofNullable(
                    connectorFacade.jdbc().countTableRows(entity, tableName, database, whereClause)
            );
        } catch (SQLException ex) {
            ExceptionLogging.recoverable(
                    log,
                    "Skip row count validation connectionId="
                            + entity.getId()
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
