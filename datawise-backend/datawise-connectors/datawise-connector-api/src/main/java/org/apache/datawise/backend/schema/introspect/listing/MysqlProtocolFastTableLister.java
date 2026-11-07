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
public final class MysqlProtocolFastTableLister implements FastTableLister {

    private final JdbcTableListingSupport support;

    @Autowired
    public MysqlProtocolFastTableLister(JdbcTableListingSupport support) {
        this.support = support;
    }

    @Override
    public boolean supports(String dbType) {
        return DbTypeFamilies.isMysqlProtocol(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException {
        String schemaName = JdbcSchemaListingScopes.resolveMysqlSchemaName(
                request.catalog(),
                request.schema(),
                request.scope());
        String pattern = JdbcTableListingSupport.toSqlLikePattern(request.namePattern());
        String sql = """
                SELECT TABLE_NAME AS table_name, TABLE_COMMENT AS table_comment
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
                """ + (pattern != null ? " AND TABLE_NAME LIKE ?" : "") + """
                 ORDER BY TABLE_NAME
                 LIMIT ? OFFSET ?
                """;
        return support.queryPagedTables(request, sql, JdbcTableListingSupport.bindLimitOffset(schemaName, pattern));
    }
}
