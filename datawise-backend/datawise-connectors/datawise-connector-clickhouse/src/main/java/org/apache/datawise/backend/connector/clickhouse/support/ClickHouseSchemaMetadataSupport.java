package org.apache.datawise.backend.connector.clickhouse.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.introspect.JdbcNameQuerySupport;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.introspect.routines.JdbcRoutineListingSupport;
import org.apache.datawise.backend.schema.introspect.views.JdbcViewListingSupport;
import org.apache.datawise.backend.schema.spi.JdbcExplorerMetadataSupport;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

public final class ClickHouseSchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    @Override
    public boolean supports(String dbType) {
        return DbType.CLICKHOUSE.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> listViews(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String database = JdbcSchemaListingScopes.preferSchemaElseCatalog(catalog, schema);
        if (database.isBlank()) {
            return List.of();
        }
        return JdbcViewListingSupport.toViewNodes(connectionId, catalog, database,
                JdbcNameQuerySupport.queryNames(connection, """
                        SELECT name FROM system.tables
                        WHERE database = ? AND engine LIKE '%View%'
                        ORDER BY name
                        """, ps -> ps.setString(1, database)));
    }

    @Override
    public List<TreeNode> listFunctions(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String database = JdbcSchemaListingScopes.preferSchemaElseCatalog(catalog, schema);
        if (database.isBlank()) {
            return List.of();
        }
        return JdbcRoutineListingSupport.toRoutineNodes(connectionId, catalog, database, "function", "fn",
                JdbcNameQuerySupport.queryNames(connection, """
                        SELECT name FROM system.functions
                        WHERE origin = 'SQLUserDefined'
                        ORDER BY name
                        """, ps -> {}));
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
    ) {
        return List.of();
    }
}
