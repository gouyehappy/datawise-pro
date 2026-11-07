package org.apache.datawise.backend.connector.sybase.support;

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

public final class SybaseSchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    @Override
    public boolean supports(String dbType) {
        return DbType.SYBASE.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> listViews(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String owner = JdbcSchemaListingScopes.preferSchemaElseCatalog(catalog, schema);
        if (owner.isBlank()) {
            return List.of();
        }
        return JdbcViewListingSupport.toViewNodes(connectionId, catalog, owner,
                queryByType(connection, owner, "V"));
    }

    @Override
    public List<TreeNode> listFunctions(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String owner = JdbcSchemaListingScopes.preferSchemaElseCatalog(catalog, schema);
        if (owner.isBlank()) {
            return List.of();
        }
        return JdbcRoutineListingSupport.toRoutineNodes(connectionId, catalog, owner, "function", "fn",
                queryByTypes(connection, owner, "SF", "FN"));
    }

    @Override
    public List<TreeNode> listProcedures(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String owner = JdbcSchemaListingScopes.preferSchemaElseCatalog(catalog, schema);
        if (owner.isBlank()) {
            return List.of();
        }
        return JdbcRoutineListingSupport.toRoutineNodes(connectionId, catalog, owner, "procedure", "proc",
                queryByType(connection, owner, "P"));
    }

    @Override
    public List<TreeNode> listTriggers(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String owner = JdbcSchemaListingScopes.preferSchemaElseCatalog(catalog, schema);
        if (owner.isBlank()) {
            return List.of();
        }
        return JdbcRoutineListingSupport.toRoutineNodes(connectionId, catalog, owner, "trigger", "trg",
                queryByType(connection, owner, "TR"));
    }

    private static List<String> queryByType(Connection connection, String owner, String type) throws SQLException {
        return JdbcNameQuerySupport.queryNames(connection, """
                SELECT name FROM sysobjects
                WHERE type = ? AND user_name(uid) = ?
                ORDER BY name
                """, ps -> {
            ps.setString(1, type);
            ps.setString(2, owner);
        });
    }

    private static List<String> queryByTypes(Connection connection, String owner, String... types) throws SQLException {
        if (types.length == 0) {
            return List.of();
        }
        StringBuilder sql = new StringBuilder("SELECT name FROM sysobjects WHERE user_name(uid) = ? AND type IN (");
        for (int i = 0; i < types.length; i++) {
            if (i > 0) {
                sql.append(',');
            }
            sql.append('?');
        }
        sql.append(") ORDER BY name");
        return JdbcNameQuerySupport.queryNames(connection, sql.toString(), ps -> {
            ps.setString(1, owner);
            for (int i = 0; i < types.length; i++) {
                ps.setString(i + 2, types[i]);
            }
        });
    }

}
