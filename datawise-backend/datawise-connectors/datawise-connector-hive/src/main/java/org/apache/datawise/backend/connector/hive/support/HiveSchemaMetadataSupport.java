package org.apache.datawise.backend.connector.hive.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.schema.introspect.JdbcNameQuerySupport;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.introspect.routines.JdbcRoutineListingSupport;
import org.apache.datawise.backend.schema.introspect.views.JdbcViewListingSupport;
import org.apache.datawise.backend.schema.spi.JdbcExplorerMetadataSupport;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public final class HiveSchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    @Override
    public boolean supports(String dbType) {
        return DbType.HIVE.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> listViews(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        CatalogSchemaScope scope = CatalogSchemaScope.parse(
                CatalogSchemaScope.formatInstanceKey(catalog, schema)
        );
        if (scope.hasSchema() && scope.catalog() != null) {
            return JdbcViewListingSupport.toViewNodes(connectionId, catalog, schema,
                    JdbcNameQuerySupport.queryNames(connection, """
                            SELECT table_name
                            FROM information_schema.views
                            WHERE table_catalog = ? AND table_schema = ?
                            ORDER BY table_name
                            """, ps -> {
                        ps.setString(1, scope.catalog());
                        ps.setString(2, scope.schema());
                    }));
        }
        String database = JdbcSchemaListingScopes.preferSchemaElseCatalog(catalog, schema);
        if (database.isBlank()) {
            return List.of();
        }
        return JdbcViewListingSupport.toViewNodes(connectionId, catalog, database,
                queryShowNames(connection, "SHOW VIEWS IN " + DbType.HIVE.quoteName(database)));
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
                queryShowNames(connection, "SHOW FUNCTIONS IN " + DbType.HIVE.quoteName(database)));
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

    private static List<String> queryShowNames(Connection connection, String sql) throws SQLException {
        List<String> names = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            while (rs.next()) {
                String name = rs.getString(1);
                if (name != null && !name.isBlank()) {
                    names.add(name.trim());
                }
            }
        }
        return names;
    }

}
