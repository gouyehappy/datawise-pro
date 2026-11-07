package org.apache.datawise.backend.schema.introspect.listing;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.jdbc.support.DbTypeFamilies;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.spi.ExplorerPageRequest;
import org.apache.datawise.backend.schema.spi.FastTableLister;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

@Component
public final class ClickHouseFastTableLister implements FastTableLister {

    private final JdbcTableListingSupport support;

    @Autowired
    public ClickHouseFastTableLister(JdbcTableListingSupport support) {
        this.support = support;
    }

    @Override
    public boolean supports(String dbType) {
        return DbTypeFamilies.isClickhouse(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException {
        String database = JdbcSchemaListingScopes.resolveMysqlSchemaName(
                request.catalog(),
                request.schema(),
                request.scope());
        String pattern = JdbcTableListingSupport.toSqlLikePattern(request.namePattern());
        String sql = """
                SELECT name AS table_name, comment AS table_comment
                FROM system.tables
                WHERE database = ?
                  AND engine NOT IN ('View', 'MaterializedView')
                """ + (pattern != null ? " AND name LIKE ?" : "") + """
                 ORDER BY name
                 LIMIT ? OFFSET ?
                """;
        return support.queryPagedTables(request, sql, JdbcTableListingSupport.bindLimitOffset(database, pattern));
    }
}
