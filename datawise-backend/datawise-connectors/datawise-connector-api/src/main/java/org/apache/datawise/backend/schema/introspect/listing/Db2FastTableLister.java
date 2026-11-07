package org.apache.datawise.backend.schema.introspect.listing;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.jdbc.support.DbTypeFamilies;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.spi.ExplorerPageRequest;
import org.apache.datawise.backend.schema.spi.FastTableLister;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.sql.SQLException;
import java.util.Locale;

@Component
public final class Db2FastTableLister implements FastTableLister {

    private final JdbcTableListingSupport support;

    @Autowired
    public Db2FastTableLister(JdbcTableListingSupport support) {
        this.support = support;
    }

    @Override
    public boolean supports(String dbType) {
        return DbTypeFamilies.isDb2Family(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException {
        String schemaName = JdbcSchemaListingScopes.resolveDb2SchemaName(
                request.catalog(),
                request.schema(),
                request.scope(),
                request.connection());
        String pattern = JdbcTableListingSupport.toSqlLikePattern(request.namePattern());
        String like = pattern != null ? pattern.toUpperCase(Locale.ROOT) : null;
        String sql = """
                SELECT TABNAME AS table_name
                FROM SYSCAT.TABLES
                WHERE TABSCHEMA = ? AND TYPE = 'T'
                """ + (like != null ? " AND TABNAME LIKE ?" : "") + """
                 ORDER BY TABNAME
                 OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
                """;
        return support.queryPagedTables(
                request,
                sql,
                JdbcTableListingSupport.bindOffsetFetch(schemaName.toUpperCase(Locale.ROOT), like));
    }
}
