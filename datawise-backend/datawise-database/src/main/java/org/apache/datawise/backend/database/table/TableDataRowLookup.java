package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** Fetches a single table row by primary key for audit snapshots. */
@Component
public class TableDataRowLookup {

    private final ConnectorFacade connectorFacade;

    public TableDataRowLookup(ConnectorFacade connectorFacade) {
        this.connectorFacade = connectorFacade;
    }

    Optional<Map<String, Object>> fetchByPrimaryKey(
            ConnectionEntity entity,
            String database,
            String tableName,
            Map<String, Object> primaryKeyValues
    ) {
        if (primaryKeyValues == null || primaryKeyValues.isEmpty()) {
            return Optional.empty();
        }
        try {
            String sql = TableDataAuditSql.buildSelectByPrimaryKey(
                    entity.getDbType(),
                    database,
                    tableName,
                    primaryKeyValues
            );
            ExecuteSqlResult result = connectorFacade.jdbc().execute(entity, sql, database, 1);
            if (result.rows() == null || result.rows().isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(copyRow(result.rows().get(0)));
        } catch (SQLException ex) {
            return Optional.empty();
        }
    }

    private static Map<String, Object> copyRow(Map<String, Object> row) {
        if (row == null || row.isEmpty()) {
            return Map.of();
        }
        return new LinkedHashMap<>(row);
    }
}
