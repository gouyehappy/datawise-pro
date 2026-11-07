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
public final class PostgresqlFastTableLister implements FastTableLister {

    private final JdbcTableListingSupport support;

    @Autowired
    public PostgresqlFastTableLister(JdbcTableListingSupport support) {
        this.support = support;
    }

    @Override
    public boolean supports(String dbType) {
        return DbTypeFamilies.isPostgresqlFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException {
        String schemaName = request.schema() != null && !request.schema().isBlank()
                ? request.schema().trim()
                : JdbcSchemaListingScopes.resolvePgSchema(request.scope(), request.connection());
        String pattern = JdbcTableListingSupport.toSqlLikePattern(request.namePattern());
        String sql = """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = ? AND table_type = 'BASE TABLE'
                """ + (pattern != null ? " AND table_name LIKE ?" : "") + """
                 ORDER BY table_name
                 LIMIT ? OFFSET ?
                """;
        return support.queryPagedTables(request, sql, JdbcTableListingSupport.bindLimitOffset(schemaName, pattern));
    }
}
