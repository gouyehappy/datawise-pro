package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.connector.document.DocumentCursorSupport;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.sql.SqlCursorService;

import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.database.table.TableDataSupport.ConnectionContext;
import org.springframework.stereotype.Service;

import java.sql.SQLException;

/** 表数据浏览：首屏拉取与游标续页。 */
@Service
public class TableDataQueryService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final SqlCursorService sqlCursorService;

    public TableDataQueryService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            SqlCursorService sqlCursorService
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.sqlCursorService = sqlCursorService;
    }

    public TableDataResult fetch(String tableName, String connectionId, String database, Integer maxRows) {
        return fetch(tableName, connectionId, database, maxRows, null, null);
    }

    public TableDataResult fetch(
            String tableName,
            String connectionId,
            String database,
            Integer maxRows,
            String cursorId
    ) {
        return fetch(tableName, connectionId, database, maxRows, cursorId, null);
    }

    public TableDataResult fetch(
            String tableName,
            String connectionId,
            String database,
            Integer maxRows,
            String cursorId,
            String filter
    ) {
        ConnectionContext context = TableDataSupport.resolveContext(
                connectionContext,
                tableName,
                connectionId,
                database
        );
        ConnectorCapabilityGuard.requireTableData(connectorFacade, context.entity());
        int pageSize = sqlCursorService.resolvePageSize(maxRows);

        if (DocumentCursorSupport.isOffsetCursor(cursorId)) {
            return fetchDocumentPage(context, tableName, cursorId, pageSize, filter);
        }
        if (cursorId != null && !cursorId.isBlank()) {
            ExecuteSqlResult page = sqlCursorService.fetchCursorPage(cursorId, maxRows);
            return new TableDataResult(
                    page.columns(),
                    page.rows(),
                    page.cursorId(),
                    page.hasMore(),
                    page.pageOffset(),
                    page.pageSize()
            );
        }

        if (ConnectorCapabilityGuard.hasDocumentRead(connectorFacade, context.entity())) {
            return connectorFacade.document().fetchCollectionPage(
                    context.entity(),
                    context.database(),
                    tableName,
                    0,
                    pageSize,
                    filter
            );
        }

        long userId = connectionContext.requireUserId();
        try {
            TableDataResult data = connectorFacade.jdbc().fetchTable(
                    context.entity(),
                    tableName,
                    context.database(),
                    pageSize,
                    0
            );
            if (!Boolean.TRUE.equals(data.hasMore())) {
                return data;
            }
            String sql = connectorFacade.jdbc().buildTableSelectSql(
                    context.entity(),
                    tableName,
                    context.database()
            );
            String nextCursorId = sqlCursorService.createCursor(
                    userId,
                    connectionId,
                    context.database(),
                    sql,
                    pageSize,
                    data.rows().size(),
                    data.columns()
            );
            return new TableDataResult(
                    data.columns(),
                    data.rows(),
                    nextCursorId,
                    true,
                    0,
                    pageSize
            );
        } catch (SQLException ex) {
            throw TableDataSupport.toTableDataException(
                    context.entity(),
                    ex,
                    TableDataException.FETCH_FAILED
            );
        }
    }

    private TableDataResult fetchDocumentPage(
            ConnectionContext context,
            String tableName,
            String cursorId,
            int pageSize,
            String filter
    ) {
        int offset = DocumentCursorSupport.parseOffset(cursorId);
        return connectorFacade.document().fetchCollectionPage(
                context.entity(),
                context.database(),
                tableName,
                offset,
                pageSize,
                filter
        );
    }
}
