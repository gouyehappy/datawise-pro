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
public final class SqlServerFastTableLister implements FastTableLister {

    private final JdbcTableListingSupport support;

    @Autowired
    public SqlServerFastTableLister(JdbcTableListingSupport support) {
        this.support = support;
    }

    @Override
    public boolean supports(String dbType) {
        return DbTypeFamilies.isSqlServerFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException {
        String schemaName = JdbcSchemaListingScopes.resolveSqlServerSchemaName(request.schema(), request.scope());
        String pattern = JdbcTableListingSupport.toSqlLikePattern(request.namePattern());
        String sql = """
                SELECT s.name AS table_schema, t.name AS table_name
                FROM sys.tables t
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name = ?
                """ + (pattern != null ? " AND t.name LIKE ?" : "") + """
                 ORDER BY s.name, t.name
                 OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
                """;
        return support.queryPagedTables(request, sql, JdbcTableListingSupport.bindOffsetFetch(schemaName, pattern));
    }
}
