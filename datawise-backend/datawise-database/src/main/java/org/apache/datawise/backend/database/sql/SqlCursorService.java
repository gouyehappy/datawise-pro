package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

import org.apache.datawise.backend.common.DeepOffsetGuard;
import org.apache.datawise.backend.common.SqlDeepOffsetException;
import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.springframework.stereotype.Service;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/** SQL 结果游标：分页 SELECT 首页、续页与 pageSize 解析。 */
@Service
public class SqlCursorService {

    static final int DEFAULT_PAGE_SIZE = 500;

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final QueryLimitResolver queryLimitResolver;
    private final SqlResultCursorStore cursorStore;
    private final OutboundEventSignals outboundEventSignals;
    private final DatawiseQueryProperties queryProperties;

    public SqlCursorService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            QueryLimitResolver queryLimitResolver,
            SqlResultCursorStore cursorStore,
            OutboundEventSignals outboundEventSignals,
            DatawiseQueryProperties queryProperties
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.queryLimitResolver = queryLimitResolver;
        this.cursorStore = cursorStore;
        this.outboundEventSignals = outboundEventSignals;
        this.queryProperties = queryProperties != null ? queryProperties : new DatawiseQueryProperties();
    }

    public ExecuteSqlResult fetchCursorPage(String cursorId, Integer pageSizeOverride) {
        long userId = connectionContext.requireUserId();
        SqlResultCursorStore.CursorEntry cursor = cursorStore.require(userId, cursorId);
        ConnectionExecutionContext.ResolvedConnection resolved = connectionContext.requireAvailableConnection(
                userId,
                cursor.connectionId(),
                "Connection not found: " + cursor.connectionId()
        );
        ConnectionEntity entity = resolved.entity();

        int pageSize = pageSizeOverride != null && pageSizeOverride > 0
                ? resolvePageSize(pageSizeOverride)
                : cursor.pageSize();

        String executionKey = resolveExecutionKey(userId, cursor.sessionKey());
        try {
            ExecuteSqlResult page = fetchPageForCursor(userId, entity, cursor, pageSize, executionKey);
            return finalizeCursorPage(cursorId, cursor, page);
        } catch (SQLException ex) {
            cursorStore.remove(cursorId);
            notifySqlExecutionFailed(userId, entity, cursor.database(), ex);
            throw SqlExecutionSupport.toSqlExecutionException(entity, ex, cursor.sql());
        }
    }

    /** Best-effort client release when a console/table tab is closed. */
    public void closeCursor(String cursorId) {
        if (cursorId == null || cursorId.isBlank()) {
            return;
        }
        long userId = connectionContext.requireUserId();
        cursorStore.removeForUser(userId, cursorId);
    }

    public ExecuteSqlResult executePagedFirstPage(
            long userId,
            ConnectionEntity entity,
            String database,
            String sql,
            Integer requestedPageSize
    ) {
        return executePagedFirstPage(userId, entity, database, sql, requestedPageSize, null);
    }

    public ExecuteSqlResult executePagedFirstPage(
            long userId,
            ConnectionEntity entity,
            String database,
            String sql,
            Integer requestedPageSize,
            String sessionKey
    ) {
        int pageSize = resolvePageSize(requestedPageSize);
        String executionKey = resolveExecutionKey(userId, sessionKey);
        try {
            // Push LIMIT/OFFSET into SQL (not just Statement#setMaxRows) so large tables
            // do not force a full scan/buffer before the first page is returned.
            ExecuteSqlResult page = executionKey != null
                    ? connectorFacade.jdbc().executeSelectPage(
                            entity, sql, database, pageSize, 0, executionKey)
                    : connectorFacade.jdbc().executeSelectPage(entity, sql, database, pageSize, 0);
            return attachCursorIfHasMore(userId, entity, database, sql, sessionKey, page, pageSize);
        } catch (SQLException ex) {
            notifySqlExecutionFailed(userId, entity, database, ex);
            throw SqlExecutionSupport.toSqlExecutionException(entity, ex, sql);
        }
    }

    /**
     * When the first page reports {@code hasMore}, open a result cursor (sessionKey retained
     * so later pages can reuse a manual transaction connection when present).
     */
    public ExecuteSqlResult attachCursorIfHasMore(
            long userId,
            ConnectionEntity entity,
            String database,
            String sql,
            String sessionKey,
            ExecuteSqlResult page,
            int pageSize
    ) {
        if (!Boolean.TRUE.equals(page.hasMore())) {
            return page;
        }
        String cursorId = cursorStore.create(
                userId,
                entity.getId(),
                database,
                sql,
                sessionKey,
                pageSize,
                page.rowCount(),
                page.columns()
        );
        return SqlExecutionSupport.copyWithCursor(page, cursorId, true, 0, pageSize);
    }

    public String createCursor(
            long userId,
            String connectionId,
            String database,
            String sql,
            int pageSize,
            int nextOffset,
            List<Map<String, Object>> columns
    ) {
        return createCursor(userId, connectionId, database, sql, null, pageSize, nextOffset, columns);
    }

    public String createCursor(
            long userId,
            String connectionId,
            String database,
            String sql,
            String sessionKey,
            int pageSize,
            int nextOffset,
            List<Map<String, Object>> columns
    ) {
        return cursorStore.create(
                userId, connectionId, database, sql, sessionKey, pageSize, nextOffset, columns
        );
    }

    public int resolvePageSize(Integer requestedPageSize) {
        // Missing/zero client page size → default page, not the absolute result ceiling.
        int requested = requestedPageSize != null && requestedPageSize > 0
                ? requestedPageSize
                : DEFAULT_PAGE_SIZE;
        int resolved = queryLimitResolver.resolve(requested);
        return resolved > 0 ? resolved : DEFAULT_PAGE_SIZE;
    }

    private void notifySqlExecutionFailed(
            long userId,
            ConnectionEntity entity,
            String database,
            SQLException ex
    ) {
        outboundEventSignals.sqlExecutionFailed(
                entity.getId() != null ? entity.getId() : "",
                entity.getName() != null ? entity.getName() : "",
                database != null ? database : "",
                ex.getMessage() != null ? ex.getMessage() : "",
                userId
        );
    }

    private ExecuteSqlResult fetchPageForCursor(
            long userId,
            ConnectionEntity entity,
            SqlResultCursorStore.CursorEntry cursor,
            int pageSize,
            String executionKey
    ) throws SQLException {
        requireOffsetWithinLimit(cursor.nextOffset());
        // Manual TX: keep paging on the held connection so uncommitted rows stay visible.
        if (cursor.sessionKey() != null
                && !cursor.sessionKey().isBlank()
                && connectorFacade.jdbc().session().requireManualSession(userId, cursor.sessionKey()) != null) {
            return connectorFacade.jdbc().session().executeSelectPageInManualSession(
                    userId,
                    cursor.sessionKey(),
                    entity,
                    cursor.database(),
                    cursor.sql(),
                    pageSize,
                    cursor.nextOffset(),
                    executionKey
            );
        }
        if (executionKey != null) {
            return connectorFacade.jdbc().executeSelectPage(
                    entity,
                    cursor.sql(),
                    cursor.database(),
                    pageSize,
                    cursor.nextOffset(),
                    executionKey
            );
        }
        return connectorFacade.jdbc().executeSelectPage(
                entity,
                cursor.sql(),
                cursor.database(),
                pageSize,
                cursor.nextOffset()
        );
    }

    private void requireOffsetWithinLimit(int offset) {
        if (DeepOffsetGuard.isDataMovement()) {
            return;
        }
        int maxOffset = queryProperties.getMaxCursorOffset();
        if (maxOffset > 0 && offset > maxOffset) {
            throw new SqlDeepOffsetException(offset, maxOffset);
        }
    }

    private ExecuteSqlResult finalizeCursorPage(
            String cursorId,
            SqlResultCursorStore.CursorEntry cursor,
            ExecuteSqlResult page
    ) {
        int pageOffset = cursor.nextOffset();
        int pageSize = cursor.pageSize();
        if (!Boolean.TRUE.equals(page.hasMore())) {
            cursorStore.remove(cursorId);
            return SqlExecutionSupport.copyWithCursor(page, null, false, pageOffset, pageSize);
        }
        cursorStore.updateOffset(cursorId, pageOffset + page.rowCount());
        return SqlExecutionSupport.copyWithCursor(page, cursorId, true, pageOffset, pageSize);
    }

    private static String resolveExecutionKey(long userId, String sessionKey) {
        if (sessionKey == null || sessionKey.isBlank()) {
            return null;
        }
        return ConsoleSqlCancelService.executionKey(userId, sessionKey);
    }
}
