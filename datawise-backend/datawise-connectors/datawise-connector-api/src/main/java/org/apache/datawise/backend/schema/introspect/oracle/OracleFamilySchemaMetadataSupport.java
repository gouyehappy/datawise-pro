package org.apache.datawise.backend.schema.introspect.oracle;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.spi.JdbcExplorerMetadataSupport;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.function.Predicate;

/** Oracle / Dameng Explorer metadata via {@link OracleFamilyDictionaryListing}. */
public final class OracleFamilySchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    private final Predicate<String> dbTypeMatcher;

    public OracleFamilySchemaMetadataSupport(Predicate<String> dbTypeMatcher) {
        this.dbTypeMatcher = Objects.requireNonNull(dbTypeMatcher, "dbTypeMatcher");
    }

    @Override
    public boolean supports(String dbType) {
        return dbTypeMatcher.test(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> listViews(
                                    Connection connection, String connectionId, String catalog, String schema, String dbType) throws SQLException {
        return OracleFamilyDictionaryListing.listViews(connection, connectionId, catalog, schema);
    }

    @Override
    public PaginatedTreeNodes listViewsPage(
                                            Connection connection,
                                            String connectionId,
                                            String catalog,
                                            String schema,
                                            String dbType,
                                            int offset,
                                            int limit,
                                            String namePattern) throws SQLException {
        return OracleFamilyDictionaryListing.listViewsPage(
                connection, connectionId, catalog, schema, offset, limit, namePattern);
    }

    @Override
    public List<TreeNode> listFunctions(
                                        Connection connection, String connectionId, String catalog, String schema, String dbType) throws SQLException {
        return OracleFamilyDictionaryListing.listFunctions(connection, connectionId, catalog, schema);
    }

    @Override
    public PaginatedTreeNodes listFunctionsPage(
                                                Connection connection,
                                                String connectionId,
                                                String catalog,
                                                String schema,
                                                String dbType,
                                                int offset,
                                                int limit,
                                                String namePattern) throws SQLException {
        return OracleFamilyDictionaryListing.listFunctionsPage(
                connection, connectionId, catalog, schema, offset, limit, namePattern);
    }

    @Override
    public List<TreeNode> listProcedures(
                                         Connection connection, String connectionId, String catalog, String schema, String dbType) throws SQLException {
        return OracleFamilyDictionaryListing.listProcedures(connection, connectionId, catalog, schema);
    }

    @Override
    public PaginatedTreeNodes listProceduresPage(
                                                 Connection connection,
                                                 String connectionId,
                                                 String catalog,
                                                 String schema,
                                                 String dbType,
                                                 int offset,
                                                 int limit,
                                                 String namePattern) throws SQLException {
        return OracleFamilyDictionaryListing.listProceduresPage(
                connection, connectionId, catalog, schema, offset, limit, namePattern);
    }

    @Override
    public List<TreeNode> listTriggers(
                                       Connection connection, String connectionId, String catalog, String schema, String dbType) throws SQLException {
        return OracleFamilyDictionaryListing.listTriggers(connection, connectionId, catalog, schema);
    }

    @Override
    public PaginatedTreeNodes listTriggersPage(
                                               Connection connection,
                                               String connectionId,
                                               String catalog,
                                               String schema,
                                               String dbType,
                                               int offset,
                                               int limit,
                                               String namePattern) throws SQLException {
        return OracleFamilyDictionaryListing.listTriggersPage(
                connection, connectionId, catalog, schema, offset, limit, namePattern);
    }
}
