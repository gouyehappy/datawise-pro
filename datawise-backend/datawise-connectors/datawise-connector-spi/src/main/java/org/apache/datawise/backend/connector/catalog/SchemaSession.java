package org.apache.datawise.backend.connector.catalog;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;

import java.sql.SQLException;
import java.util.List;

/** Explorer schema 树单次 JDBC 会话（实现位于 connector-api / jdbc-runtime）。 */
public interface SchemaSession extends AutoCloseable {

    @Override
    void close() throws SQLException;

    List<TreeNode> introspectConnection() throws SQLException;

    List<TreeNode> loadDatabaseChildren(String catalog) throws SQLException;

    default List<TreeNode> loadSchemaChildren(String catalog, String schema) throws SQLException {
        throw new SQLException("Schema children not supported for this datasource");
    }

    List<TreeNode> loadTableList(String catalog) throws SQLException;

    default List<TreeNode> loadTableList(String catalog, String schema) throws SQLException {
        return loadTableList(catalog);
    }

    default List<TreeNode> loadViewList(String catalog) throws SQLException {
        return loadViewList(catalog, null);
    }

    default List<TreeNode> loadViewList(String catalog, String schema) throws SQLException {
        return List.of();
    }

    default List<TreeNode> loadFunctionList(String catalog) throws SQLException {
        return loadFunctionList(catalog, null);
    }

    default List<TreeNode> loadFunctionList(String catalog, String schema) throws SQLException {
        return List.of();
    }

    default List<TreeNode> loadProcedureList(String catalog) throws SQLException {
        return loadProcedureList(catalog, null);
    }

    default List<TreeNode> loadProcedureList(String catalog, String schema) throws SQLException {
        return List.of();
    }

    default List<TreeNode> loadTriggerList(String catalog) throws SQLException {
        return loadTriggerList(catalog, null);
    }

    default List<TreeNode> loadTriggerList(String catalog, String schema) throws SQLException {
        return List.of();
    }

    default PaginatedTreeNodes loadViewListPage(
                                                String catalog,
                                                String schema,
                                                int offset,
                                                int limit,
                                                String namePattern) throws SQLException {
        List<TreeNode> all = loadViewList(catalog, schema);
        return sliceWithPattern(all, offset, limit, namePattern);
    }

    default PaginatedTreeNodes loadFunctionListPage(
                                                    String catalog,
                                                    String schema,
                                                    int offset,
                                                    int limit,
                                                    String namePattern) throws SQLException {
        List<TreeNode> all = loadFunctionList(catalog, schema);
        return sliceWithPattern(all, offset, limit, namePattern);
    }

    default PaginatedTreeNodes loadProcedureListPage(
                                                     String catalog,
                                                     String schema,
                                                     int offset,
                                                     int limit,
                                                     String namePattern) throws SQLException {
        List<TreeNode> all = loadProcedureList(catalog, schema);
        return sliceWithPattern(all, offset, limit, namePattern);
    }

    default PaginatedTreeNodes loadTriggerListPage(
                                                   String catalog,
                                                   String schema,
                                                   int offset,
                                                   int limit,
                                                   String namePattern) throws SQLException {
        List<TreeNode> all = loadTriggerList(catalog, schema);
        return sliceWithPattern(all, offset, limit, namePattern);
    }

    default PaginatedTreeNodes loadTableListPage(
                                                 String catalog,
                                                 String schema,
                                                 int offset,
                                                 int limit,
                                                 boolean skeleton,
                                                 String namePattern) throws SQLException {
        List<TreeNode> all = schema != null && !schema.isBlank()
                ? loadTableList(catalog, schema)
                : loadTableList(catalog);
        return sliceWithPattern(all, offset, limit, namePattern);
    }

    private static PaginatedTreeNodes sliceWithPattern(
                                                       List<TreeNode> all,
                                                       int offset,
                                                       int limit,
                                                       String namePattern) {
        List<TreeNode> filtered = all;
        if (namePattern != null && !namePattern.isBlank() && !"*".equals(namePattern.trim())) {
            String regex = namePattern.trim().toLowerCase(java.util.Locale.ROOT).replace("*", ".*");
            java.util.regex.Pattern compiled = java.util.regex.Pattern.compile(regex);
            filtered = new java.util.ArrayList<>();
            for (TreeNode node : all) {
                if (node != null && node.getLabel() != null
                        && compiled.matcher(node.getLabel().toLowerCase(java.util.Locale.ROOT)).matches()) {
                    filtered.add(node);
                }
            }
        }
        return PaginatedTreeNodes.slice(filtered, offset, limit);
    }

    List<TreeNode> loadTableSkeletonChildren(String catalog, String tableName);

    default List<TreeNode> loadTableSkeletonChildren(String catalog, String schema, String tableName) {
        return loadTableSkeletonChildren(catalog, tableName);
    }

    default List<TreeNode> loadViewSkeletonChildren(String catalog, String viewName) {
        return loadViewSkeletonChildren(catalog, null, viewName);
    }

    default List<TreeNode> loadViewSkeletonChildren(String catalog, String schema, String viewName) {
        return List.of();
    }

    List<TreeNode> loadColumnChildren(String catalog, String tableName) throws SQLException;

    default List<TreeNode> loadColumnChildren(String catalog, String schema, String tableName) throws SQLException {
        return loadColumnChildren(catalog, tableName);
    }

    List<TreeNode> loadKeyChildren(String catalog, String tableName) throws SQLException;

    default List<TreeNode> loadKeyChildren(String catalog, String schema, String tableName) throws SQLException {
        return loadKeyChildren(catalog, tableName);
    }

    List<TreeNode> loadIndexChildren(String catalog, String tableName) throws SQLException;

    default List<TreeNode> loadIndexChildren(String catalog, String schema, String tableName) throws SQLException {
        return loadIndexChildren(catalog, tableName);
    }

    String connectionId();

    /** JDBC 会话是否仍可安全复用；非 JDBC 实现默认可用。 */
    default boolean isConnectionUsable() {
        return true;
    }
}
