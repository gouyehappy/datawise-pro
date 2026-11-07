package org.apache.datawise.backend.connector.sqlite.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.introspect.JdbcNameQuerySupport;
import org.apache.datawise.backend.schema.introspect.routines.JdbcRoutineListingSupport;
import org.apache.datawise.backend.schema.introspect.views.JdbcViewListingSupport;
import org.apache.datawise.backend.schema.spi.JdbcExplorerMetadataSupport;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

public final class SqliteSchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    @Override
    public boolean supports(String dbType) {
        return DbType.SQLITE3.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> listViews(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        return JdbcViewListingSupport.toViewNodes(connectionId, catalog, schema,
                JdbcNameQuerySupport.queryNames(connection, """
                        SELECT name FROM sqlite_master
                        WHERE type = 'view' AND name NOT LIKE 'sqlite_%'
                        ORDER BY name
                        """, ps -> {}));
    }

    @Override
    public List<TreeNode> listFunctions(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) {
        return List.of();
    }

    @Override
    public List<TreeNode> listProcedures(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) {
        return List.of();
    }

    @Override
    public List<TreeNode> listTriggers(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        return JdbcRoutineListingSupport.toRoutineNodes(connectionId, catalog, schema, "trigger", "trg",
                JdbcNameQuerySupport.queryNames(connection, """
                        SELECT name FROM sqlite_master
                        WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%'
                        ORDER BY name
                        """, ps -> {}));
    }
}
