package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.database.sql.QueryLimitResolver;
import org.springframework.stereotype.Component;

/** 单表 DDL + 可选 INSERT 脚本片段。 */
@Component
public class TableSqlSectionBuilder {

    private final TableDetailService tableDetailService;
    private final TableDataService tableDataService;
    private final QueryLimitResolver queryLimitResolver;
    private final ConnectorFacade connectorFacade;

    public TableSqlSectionBuilder(
            TableDetailService tableDetailService,
            TableDataService tableDataService,
            QueryLimitResolver queryLimitResolver,
            ConnectorFacade connectorFacade
    ) {
        this.tableDetailService = tableDetailService;
        this.tableDataService = tableDataService;
        this.queryLimitResolver = queryLimitResolver;
        this.connectorFacade = connectorFacade;
    }

    String buildTableSection(
            ConnectionEntity entity,
            String database,
            String tableName,
            String connectionId,
            boolean includeData,
            Integer maxRows
    ) {
        TableDdlResult ddl = tableDetailService.loadDdl(tableName, connectionId, database);
        String dbType = entity.getDbType();
        StringBuilder sb = new StringBuilder();
        sb.append(connectorFacade.dml().buildDropTableIfExists(dbType, database, tableName));
        String ddlText = ddl.ddl() != null ? ddl.ddl().trim() : "";
        if (!ddlText.isEmpty()) {
            sb.append(ddlText);
            if (!ddlText.endsWith(";")) {
                sb.append(';');
            }
            sb.append("\n");
        }
        if (includeData) {
            TableDataResult data = tableDataService.fetch(
                    tableName,
                    connectionId,
                    database,
                    queryLimitResolver.resolve(maxRows)
            );
            String inserts = connectorFacade.dml().buildInsertsFromTableData(dbType, database, tableName, data);
            if (!inserts.isBlank()) {
                sb.append("\n").append(inserts);
            }
        }
        return sb.toString().trim() + "\n";
    }
}
