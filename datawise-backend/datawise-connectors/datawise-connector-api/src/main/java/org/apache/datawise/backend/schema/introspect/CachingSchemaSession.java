package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Decorator that caches expensive JDBC metadata reads for one explorer session. */
public final class CachingSchemaSession implements SchemaSession {

    private final SchemaSession delegate;
    private final Map<String, List<TreeNode>> nodeCache = new HashMap<>();

    public CachingSchemaSession(SchemaSession delegate) {
        this.delegate = delegate;
    }

    @Override
    public List<TreeNode> introspectConnection() throws SQLException {
        return cached("connection", delegate::introspectConnection);
    }

    @Override
    public List<TreeNode> loadDatabaseChildren(String catalog) throws SQLException {
        return cached("database:" + catalog, () -> delegate.loadDatabaseChildren(catalog));
    }

    @Override
    public List<TreeNode> loadSchemaChildren(String catalog, String schema) throws SQLException {
        return cached("schema:" + catalog + ":" + schema, () -> delegate.loadSchemaChildren(catalog, schema));
    }

    @Override
    public List<TreeNode> loadTableList(String catalog) throws SQLException {
        return cached("tables:" + catalog, () -> delegate.loadTableList(catalog));
    }

    @Override
    public List<TreeNode> loadTableList(String catalog, String schema) throws SQLException {
        return cached("tables:" + catalog + ":" + schema, () -> delegate.loadTableList(catalog, schema));
    }

    @Override
    public List<TreeNode> loadViewList(String catalog) throws SQLException {
        return cached("views:" + catalog, () -> delegate.loadViewList(catalog));
    }

    @Override
    public List<TreeNode> loadViewList(String catalog, String schema) throws SQLException {
        return cached("views:" + catalog + ":" + schema, () -> delegate.loadViewList(catalog, schema));
    }

    @Override
    public List<TreeNode> loadFunctionList(String catalog) throws SQLException {
        return cached("functions:" + catalog, () -> delegate.loadFunctionList(catalog));
    }

    @Override
    public List<TreeNode> loadFunctionList(String catalog, String schema) throws SQLException {
        return cached("functions:" + catalog + ":" + schema, () -> delegate.loadFunctionList(catalog, schema));
    }

    @Override
    public List<TreeNode> loadProcedureList(String catalog) throws SQLException {
        return cached("procedures:" + catalog, () -> delegate.loadProcedureList(catalog));
    }

    @Override
    public List<TreeNode> loadProcedureList(String catalog, String schema) throws SQLException {
        return cached("procedures:" + catalog + ":" + schema, () -> delegate.loadProcedureList(catalog, schema));
    }

    @Override
    public List<TreeNode> loadTriggerList(String catalog) throws SQLException {
        return cached("triggers:" + catalog, () -> delegate.loadTriggerList(catalog));
    }

    @Override
    public List<TreeNode> loadTriggerList(String catalog, String schema) throws SQLException {
        return cached("triggers:" + catalog + ":" + schema, () -> delegate.loadTriggerList(catalog, schema));
    }

    @Override
    public PaginatedTreeNodes loadTableListPage(
                                                String catalog,
                                                String schema,
                                                int offset,
                                                int limit,
                                                boolean skeleton,
                                                String namePattern) throws SQLException {
        return delegate.loadTableListPage(catalog, schema, offset, limit, skeleton, namePattern);
    }

    @Override
    public PaginatedTreeNodes loadViewListPage(
                                               String catalog,
                                               String schema,
                                               int offset,
                                               int limit,
                                               String namePattern) throws SQLException {
        return delegate.loadViewListPage(catalog, schema, offset, limit, namePattern);
    }

    @Override
    public PaginatedTreeNodes loadFunctionListPage(
                                                   String catalog,
                                                   String schema,
                                                   int offset,
                                                   int limit,
                                                   String namePattern) throws SQLException {
        return delegate.loadFunctionListPage(catalog, schema, offset, limit, namePattern);
    }

    @Override
    public PaginatedTreeNodes loadProcedureListPage(
                                                    String catalog,
                                                    String schema,
                                                    int offset,
                                                    int limit,
                                                    String namePattern) throws SQLException {
        return delegate.loadProcedureListPage(catalog, schema, offset, limit, namePattern);
    }

    @Override
    public PaginatedTreeNodes loadTriggerListPage(
                                                  String catalog,
                                                  String schema,
                                                  int offset,
                                                  int limit,
                                                  String namePattern) throws SQLException {
        return delegate.loadTriggerListPage(catalog, schema, offset, limit, namePattern);
    }

    @Override
    public List<TreeNode> loadTableSkeletonChildren(String catalog, String tableName) {
        String key = "skeleton:" + catalog + ":" + tableName;
        List<TreeNode> cached = nodeCache.get(key);
        if (cached != null) {
            return cached;
        }
        List<TreeNode> loaded = delegate.loadTableSkeletonChildren(catalog, tableName);
        nodeCache.put(key, loaded);
        return loaded;
    }

    @Override
    public List<TreeNode> loadTableSkeletonChildren(String catalog, String schema, String tableName) {
        String key = "skeleton:" + catalog + ":" + schema + ":" + tableName;
        List<TreeNode> cached = nodeCache.get(key);
        if (cached != null) {
            return cached;
        }
        List<TreeNode> loaded = delegate.loadTableSkeletonChildren(catalog, schema, tableName);
        nodeCache.put(key, loaded);
        return loaded;
    }

    @Override
    public List<TreeNode> loadViewSkeletonChildren(String catalog, String viewName) {
        String key = "view-skeleton:" + catalog + ":" + viewName;
        List<TreeNode> cached = nodeCache.get(key);
        if (cached != null) {
            return cached;
        }
        List<TreeNode> loaded = delegate.loadViewSkeletonChildren(catalog, viewName);
        nodeCache.put(key, loaded);
        return loaded;
    }

    @Override
    public List<TreeNode> loadViewSkeletonChildren(String catalog, String schema, String viewName) {
        String key = "view-skeleton:" + catalog + ":" + schema + ":" + viewName;
        List<TreeNode> cached = nodeCache.get(key);
        if (cached != null) {
            return cached;
        }
        List<TreeNode> loaded = delegate.loadViewSkeletonChildren(catalog, schema, viewName);
        nodeCache.put(key, loaded);
        return loaded;
    }

    @Override
    public List<TreeNode> loadColumnChildren(String catalog, String tableName) throws SQLException {
        return cached("columns:" + catalog + ":" + tableName, () -> delegate.loadColumnChildren(catalog, tableName));
    }

    @Override
    public List<TreeNode> loadColumnChildren(String catalog, String schema, String tableName) throws SQLException {
        return cached(
                "columns:" + catalog + ":" + schema + ":" + tableName,
                () -> delegate.loadColumnChildren(catalog, schema, tableName));
    }

    @Override
    public List<TreeNode> loadKeyChildren(String catalog, String tableName) throws SQLException {
        return cached("keys:" + catalog + ":" + tableName, () -> delegate.loadKeyChildren(catalog, tableName));
    }

    @Override
    public List<TreeNode> loadKeyChildren(String catalog, String schema, String tableName) throws SQLException {
        return cached(
                "keys:" + catalog + ":" + schema + ":" + tableName,
                () -> delegate.loadKeyChildren(catalog, schema, tableName));
    }

    @Override
    public List<TreeNode> loadIndexChildren(String catalog, String tableName) throws SQLException {
        return cached("indexes:" + catalog + ":" + tableName, () -> delegate.loadIndexChildren(catalog, tableName));
    }

    @Override
    public List<TreeNode> loadIndexChildren(String catalog, String schema, String tableName) throws SQLException {
        return cached(
                "indexes:" + catalog + ":" + schema + ":" + tableName,
                () -> delegate.loadIndexChildren(catalog, schema, tableName));
    }

    @Override
    public String connectionId() {
        return delegate.connectionId();
    }

    @Override
    public boolean isConnectionUsable() {
        return delegate.isConnectionUsable();
    }

    @Override
    public void close() throws SQLException {
        nodeCache.clear();
        delegate.close();
    }

    private List<TreeNode> cached(String key, SqlSupplier supplier) throws SQLException {
        List<TreeNode> cached = nodeCache.get(key);
        if (cached != null) {
            return cached;
        }
        List<TreeNode> loaded = supplier.get();
        nodeCache.put(key, loaded);
        return loaded;
    }

    @FunctionalInterface
    private interface SqlSupplier {

        List<TreeNode> get() throws SQLException;
    }
}
