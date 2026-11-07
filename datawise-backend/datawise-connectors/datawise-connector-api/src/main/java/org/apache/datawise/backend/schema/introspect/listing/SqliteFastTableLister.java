package org.apache.datawise.backend.schema.introspect.listing;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.schema.spi.ExplorerPageRequest;
import org.apache.datawise.backend.schema.spi.FastTableLister;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

@Component
public final class SqliteFastTableLister implements FastTableLister {

    private final JdbcTableListingSupport support;

    @Autowired
    public SqliteFastTableLister(JdbcTableListingSupport support) {
        this.support = support;
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.SQLITE3.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException {
        String pattern = JdbcTableListingSupport.toSqlLikePattern(request.namePattern());
        String sql = """
                SELECT name AS table_name
                FROM sqlite_master
                WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                """ + (pattern != null ? " AND name LIKE ?" : "") + """
                 ORDER BY name
                 LIMIT ? OFFSET ?
                """;
        return support.queryPagedTables(request, sql, (ps, probeLimit, offset) -> {
            int param = 1;
            if (pattern != null) {
                ps.setString(param++, pattern);
            }
            ps.setInt(param++, probeLimit);
            ps.setInt(param, offset);
        });
    }
}
