package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaScope;
import org.springframework.stereotype.Component;

import org.springframework.stereotype.Component;

import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 通过 JDBC DatabaseMetaData 列举库内表名。 */
@Component
public class TableCatalogTableLister {

    private final ConnectorFacade connectorFacade;

    public TableCatalogTableLister(ConnectorFacade connectorFacade) {
        this.connectorFacade = connectorFacade;
    }

    public List<String> listTables(ConnectionEntity entity, String database) {
        try {
            return connectorFacade.jdbc().withConnection(entity, database, connection -> {
                DatabaseMetaData meta = connection.getMetaData();
                var dialect = connectorFacade.schema().resolve(entity.getDbType());
                SchemaScope scope = dialect.resolveScope(connection, database);
                List<String> tables = new ArrayList<>();
                try (ResultSet rs = meta.getTables(scope.catalogPattern(), scope.schemaPattern(), "%", new String[]{"TABLE"})) {
                    while (rs.next()) {
                        String tableName = rs.getString("TABLE_NAME");
                        if (tableName != null && !tableName.isBlank()) {
                            tables.add(tableName);
                        }
                    }
                }
                tables.sort(Comparator.naturalOrder());
                return tables;
            });
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(ex);
        }
    }
}
