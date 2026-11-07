package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.support.SqlServerCatalogSupport;
import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.jdbc.execution.JdbcQueryExecutor;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.schema.JdbcRoutineListerRegistry;
import org.apache.datawise.backend.schema.JdbcSchemaExplorerRegistry;
import org.apache.datawise.backend.schema.JdbcSchemaViewListerRegistry;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.spi.ExplorerListRequest;
import org.apache.datawise.backend.schema.spi.ExplorerPageRequest;
import org.apache.datawise.backend.schema.spi.JdbcRoutineLister;
import org.apache.datawise.backend.schema.spi.JdbcSchemaViewLister;
import org.apache.datawise.backend.schema.TableMetadataLoader;
import org.apache.datawise.backend.schema.introspect.listing.FastTableListingRegistry;
import org.apache.datawise.backend.schema.introspect.listing.JdbcDialectTableLister;
import org.apache.datawise.backend.schema.introspect.listing.JdbcTableListingSupport;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * 连接树 schema 自省入口。按 dbType 选择 {@link SchemaDialect}，表级 keys/indexes 由 JDBC 元数据统一加载。
 */
@Component
public class JdbcSchemaIntrospector {

    private final SchemaDialectRegistry dialectRegistry;
    private final JdbcQueryExecutor jdbcQueryExecutor;
    private final JdbcCatalogLoader catalogLoader;
    private final JdbcTableLister tableLister;
    private final SchemaTreeBuilder treeBuilder;
    private final JdbcSchemaExplorerRegistry explorerRegistry;
    private final JdbcRoutineListerRegistry routineListerRegistry;
    private final JdbcSchemaViewListerRegistry viewListerRegistry;

    @Autowired
    public JdbcSchemaIntrospector(
                                  SchemaDialectRegistry dialectRegistry,
                                  JdbcQueryExecutor jdbcQueryExecutor,
                                  JdbcSchemaExplorerRegistry explorerRegistry,
                                  JdbcRoutineListerRegistry routineListerRegistry,
                                  JdbcSchemaViewListerRegistry viewListerRegistry,
                                  JdbcTableListingSupport tableListingSupport,
                                  FastTableListingRegistry fastTableListingRegistry) {
        this.dialectRegistry = dialectRegistry;
        this.jdbcQueryExecutor = jdbcQueryExecutor;
        this.explorerRegistry = explorerRegistry;
        this.routineListerRegistry = routineListerRegistry;
        this.viewListerRegistry = viewListerRegistry;
        this.treeBuilder = new SchemaTreeBuilder();
        this.catalogLoader = new JdbcCatalogLoader(dialectRegistry, treeBuilder, explorerRegistry);
        JdbcTableListingSupport support = tableListingSupport != null
                ? tableListingSupport
                : new JdbcTableListingSupport(treeBuilder);
        FastTableListingRegistry tableRegistry =
                fastTableListingRegistry != null && hasAnyFastLister(fastTableListingRegistry)
                        ? fastTableListingRegistry
                        : FastTableListingRegistry.withBuiltins(support);
        this.tableLister = new JdbcTableLister(
                new JdbcDialectTableLister(dialectRegistry, explorerRegistry, support, tableRegistry));
    }

    /** Test path without Spring FastTable beans. */
    JdbcSchemaIntrospector(
                           SchemaDialectRegistry dialectRegistry,
                           JdbcQueryExecutor jdbcQueryExecutor,
                           JdbcSchemaExplorerRegistry explorerRegistry,
                           JdbcRoutineListerRegistry routineListerRegistry,
                           JdbcSchemaViewListerRegistry viewListerRegistry) {
        this(
                dialectRegistry,
                jdbcQueryExecutor,
                explorerRegistry,
                routineListerRegistry,
                viewListerRegistry,
                null,
                null);
    }

    private static boolean hasAnyFastLister(FastTableListingRegistry registry) {
        return registry.find("mysql").isPresent()
                || registry.find("postgresql").isPresent()
                || registry.find("oracle").isPresent()
                || registry.find("sqlserver").isPresent();
    }

    public List<TreeNode> introspectConnection(ConnectionEntity entity) throws SQLException {
        try (SchemaSession session = openSession(entity)) {
            return session.introspectConnection();
        }
    }

    public SchemaSession openSession(ConnectionEntity entity) throws SQLException {
        return new CachingSchemaSession(
                new SchemaIntrospectionSession(openConnection(entity), this, entity));
    }

    List<TreeNode> introspectConnection(Connection connection, ConnectionEntity entity) throws SQLException {
        return catalogLoader.introspect(connection, entity.getId(), normalizeDbType(entity.getDbType()));
    }

    public List<TreeNode> loadDatabaseChildren(ConnectionEntity entity, String catalog) throws SQLException {
        try (SchemaSession session = openSession(entity)) {
            return session.loadDatabaseChildren(catalog);
        }
    }

    List<TreeNode> loadDatabaseChildren(Connection connection, ConnectionEntity entity, String catalog) throws SQLException {
        String dbType = normalizeDbType(entity.getDbType());
        var explorer = explorerRegistry.find(dbType);
        if (explorer.isPresent()) {
            return explorer.get().loadDatabaseChildren(connection, entity.getId(), catalog);
        }
        SchemaDialect dialect = dialectRegistry.resolve(dbType);
        if (dialect.usesCatalogSchemaHierarchy() || DbType.usesCatalogSchemaInstanceKey(dbType)) {
            return listSchemasInCatalog(connection, entity, catalog);
        }
        return treeBuilder.buildDatabaseChildren(entity.getId(), catalog, List.of());
    }

    List<TreeNode> loadSchemaChildren(Connection connection, ConnectionEntity entity, String catalog, String schema) {
        return treeBuilder.buildSchemaChildren(entity.getId(), catalog, schema, List.of());
    }

    public List<TreeNode> loadTableList(ConnectionEntity entity, String catalog) throws SQLException {
        try (SchemaSession session = openSession(entity)) {
            return session.loadTableList(catalog);
        }
    }

    List<TreeNode> loadTableList(Connection connection, ConnectionEntity entity, String catalog) throws SQLException {
        return tableLister.listTables(connection, entity.getId(), catalog, normalizeDbType(entity.getDbType()));
    }

    List<TreeNode> loadTableList(
                                 Connection connection,
                                 ConnectionEntity entity,
                                 String catalog,
                                 String schema) throws SQLException {
        return tableLister.listTables(
                connection,
                entity.getId(),
                catalog,
                schema,
                normalizeDbType(entity.getDbType()),
                false);
    }

    PaginatedTreeNodes loadTableListPage(
                                         Connection connection,
                                         ConnectionEntity entity,
                                         String catalog,
                                         String schema,
                                         int offset,
                                         int limit,
                                         boolean skeleton,
                                         String namePattern) throws SQLException {
        return tableLister.listTablesPage(
                connection,
                entity.getId(),
                catalog,
                schema,
                normalizeDbType(entity.getDbType()),
                offset,
                limit,
                skeleton,
                namePattern);
    }

    List<TreeNode> loadViewList(Connection connection, ConnectionEntity entity, String catalog) throws SQLException {
        return loadViewList(connection, entity, catalog, null);
    }

    List<TreeNode> loadViewList(
                                Connection connection,
                                ConnectionEntity entity,
                                String catalog,
                                String schema) throws SQLException {
        return dispatchLister(
                entity,
                dbType -> viewListerRegistry == null ? null : viewListerRegistry.find(dbType).orElse(null),
                JdbcSchemaViewLister::listViews,
                connection,
                catalog,
                schema);
    }

    List<TreeNode> loadFunctionList(Connection connection, ConnectionEntity entity, String catalog) throws SQLException {
        return loadFunctionList(connection, entity, catalog, null);
    }

    List<TreeNode> loadFunctionList(
                                    Connection connection,
                                    ConnectionEntity entity,
                                    String catalog,
                                    String schema) throws SQLException {
        return loadRoutineList(connection, entity, catalog, schema, JdbcRoutineLister::listFunctions);
    }

    List<TreeNode> loadProcedureList(Connection connection, ConnectionEntity entity, String catalog) throws SQLException {
        return loadProcedureList(connection, entity, catalog, null);
    }

    List<TreeNode> loadProcedureList(
                                     Connection connection,
                                     ConnectionEntity entity,
                                     String catalog,
                                     String schema) throws SQLException {
        return loadRoutineList(connection, entity, catalog, schema, JdbcRoutineLister::listProcedures);
    }

    List<TreeNode> loadTriggerList(Connection connection, ConnectionEntity entity, String catalog) throws SQLException {
        return loadTriggerList(connection, entity, catalog, null);
    }

    List<TreeNode> loadTriggerList(
                                   Connection connection,
                                   ConnectionEntity entity,
                                   String catalog,
                                   String schema) throws SQLException {
        return loadRoutineList(connection, entity, catalog, schema, JdbcRoutineLister::listTriggers);
    }

    PaginatedTreeNodes loadViewListPage(
                                        Connection connection,
                                        ConnectionEntity entity,
                                        String catalog,
                                        String schema,
                                        int offset,
                                        int limit,
                                        String namePattern) throws SQLException {
        return dispatchViewPage(connection, entity, catalog, schema, offset, limit, namePattern);
    }

    PaginatedTreeNodes loadFunctionListPage(
                                            Connection connection,
                                            ConnectionEntity entity,
                                            String catalog,
                                            String schema,
                                            int offset,
                                            int limit,
                                            String namePattern) throws SQLException {
        return dispatchRoutinePage(
                connection, entity, catalog, schema, offset, limit, namePattern,
                JdbcRoutineLister::listFunctionsPage);
    }

    PaginatedTreeNodes loadProcedureListPage(
                                             Connection connection,
                                             ConnectionEntity entity,
                                             String catalog,
                                             String schema,
                                             int offset,
                                             int limit,
                                             String namePattern) throws SQLException {
        return dispatchRoutinePage(
                connection, entity, catalog, schema, offset, limit, namePattern,
                JdbcRoutineLister::listProceduresPage);
    }

    PaginatedTreeNodes loadTriggerListPage(
                                           Connection connection,
                                           ConnectionEntity entity,
                                           String catalog,
                                           String schema,
                                           int offset,
                                           int limit,
                                           String namePattern) throws SQLException {
        return dispatchRoutinePage(
                connection, entity, catalog, schema, offset, limit, namePattern,
                JdbcRoutineLister::listTriggersPage);
    }

    private PaginatedTreeNodes dispatchViewPage(
                                                Connection connection,
                                                ConnectionEntity entity,
                                                String catalog,
                                                String schema,
                                                int offset,
                                                int limit,
                                                String namePattern) throws SQLException {
        String dbType = normalizeDbType(entity.getDbType());
        JdbcSchemaViewLister lister = viewListerRegistry == null
                ? null
                : viewListerRegistry.find(dbType).orElse(null);
        if (lister == null) {
            return PaginatedTreeNodes.empty();
        }
        return lister.listViewsPage(ExplorerPageRequest.of(
                connection, entity.getId(), catalog, schema, dbType, offset, limit, namePattern));
    }

    private PaginatedTreeNodes dispatchRoutinePage(
                                                   Connection connection,
                                                   ConnectionEntity entity,
                                                   String catalog,
                                                   String schema,
                                                   int offset,
                                                   int limit,
                                                   String namePattern,
                                                   RoutinePageCall loader) throws SQLException {
        String dbType = normalizeDbType(entity.getDbType());
        JdbcRoutineLister lister = routineListerRegistry == null
                ? null
                : routineListerRegistry.find(dbType).orElse(null);
        if (lister == null) {
            return PaginatedTreeNodes.empty();
        }
        return loader.load(lister, ExplorerPageRequest.of(
                connection, entity.getId(), catalog, schema, dbType, offset, limit, namePattern));
    }

    private List<TreeNode> loadRoutineList(
                                           Connection connection,
                                           ConnectionEntity entity,
                                           String catalog,
                                           String schema,
                                           ListerCall<JdbcRoutineLister> loader) throws SQLException {
        return dispatchLister(
                entity,
                dbType -> routineListerRegistry == null ? null : routineListerRegistry.find(dbType).orElse(null),
                loader,
                connection,
                catalog,
                schema);
    }

    private <T> List<TreeNode> dispatchLister(
                                              ConnectionEntity entity,
                                              java.util.function.Function<String, T> resolve,
                                              ListerCall<T> loader,
                                              Connection connection,
                                              String catalog,
                                              String schema) throws SQLException {
        String dbType = normalizeDbType(entity.getDbType());
        T lister = resolve.apply(dbType);
        if (lister == null) {
            return List.of();
        }
        return loader.load(lister, ExplorerListRequest.of(
                connection, entity.getId(), catalog, schema, dbType));
    }

    @FunctionalInterface
    private interface ListerCall<T> {

        List<TreeNode> load(T lister, ExplorerListRequest request) throws SQLException;
    }

    @FunctionalInterface
    private interface RoutinePageCall {

        PaginatedTreeNodes load(JdbcRoutineLister lister, ExplorerPageRequest request) throws SQLException;
    }

    public List<TreeNode> loadTableSkeletonChildren(ConnectionEntity entity, String catalog, String tableName) {
        return loadTableSkeletonChildren(entity.getId(), catalog, tableName);
    }

    List<TreeNode> loadTableSkeletonChildren(String connectionId, String catalog, String tableName) {
        return treeBuilder.buildTableSkeleton(connectionId, catalog, tableName);
    }

    List<TreeNode> loadTableSkeletonChildren(
                                             String connectionId,
                                             String catalog,
                                             String schema,
                                             String tableName) {
        return treeBuilder.buildTableSkeleton(connectionId, catalog, schema, tableName);
    }

    List<TreeNode> loadViewSkeletonChildren(String connectionId, String catalog, String viewName) {
        return treeBuilder.buildViewSkeleton(connectionId, catalog, viewName);
    }

    List<TreeNode> loadViewSkeletonChildren(
                                            String connectionId,
                                            String catalog,
                                            String schema,
                                            String viewName) {
        return treeBuilder.buildViewSkeleton(connectionId, catalog, schema, viewName);
    }

    public List<TreeNode> loadColumnChildren(ConnectionEntity entity, String catalog, String tableName) throws SQLException {
        try (SchemaSession session = openSession(entity)) {
            return session.loadColumnChildren(catalog, tableName);
        }
    }

    List<TreeNode> loadColumnChildren(
                                      Connection connection,
                                      ConnectionEntity entity,
                                      String catalog,
                                      String tableName) throws SQLException {
        return loadColumnChildren(connection, entity, catalog, null, tableName);
    }

    List<TreeNode> loadColumnChildren(
                                      Connection connection,
                                      ConnectionEntity entity,
                                      String catalog,
                                      String schema,
                                      String tableName) throws SQLException {
        String dbType = normalizeDbType(entity.getDbType());
        var explorer = explorerRegistry.find(dbType);
        if (explorer.isPresent()) {
            String database = CatalogSchemaScope.formatInstanceKey(catalog, schema);
            return treeBuilder.loadColumnNodesFromDetails(
                    entity.getId(),
                    catalog,
                    schema,
                    tableName,
                    explorer.get().loadColumns(connection, database, tableName));
        }
        SchemaScope scope = resolveScope(connection, entity.getDbType(), catalog, schema);
        return treeBuilder.loadColumnNodes(connection, entity.getId(), catalog, tableName, scope);
    }

    public List<TreeNode> loadKeyChildren(ConnectionEntity entity, String catalog, String tableName) throws SQLException {
        try (SchemaSession session = openSession(entity)) {
            return session.loadKeyChildren(catalog, tableName);
        }
    }

    List<TreeNode> loadKeyChildren(
                                   Connection connection,
                                   ConnectionEntity entity,
                                   String catalog,
                                   String tableName) throws SQLException {
        return loadKeyChildren(connection, entity, catalog, null, tableName);
    }

    List<TreeNode> loadKeyChildren(
                                   Connection connection,
                                   ConnectionEntity entity,
                                   String catalog,
                                   String schema,
                                   String tableName) throws SQLException {
        SchemaScope scope = resolveScope(connection, entity.getDbType(), catalog, schema);
        var meta = connection.getMetaData();
        List<TreeNode> keyNodes = new ArrayList<>();
        keyNodes.addAll(TableMetadataLoader.loadPrimaryKeyNodes(meta, entity.getId(), catalog, tableName, scope));
        keyNodes.addAll(TableMetadataLoader.loadForeignKeyNodes(meta, entity.getId(), catalog, tableName, scope));
        return keyNodes;
    }

    public List<TreeNode> loadIndexChildren(ConnectionEntity entity, String catalog, String tableName) throws SQLException {
        try (SchemaSession session = openSession(entity)) {
            return session.loadIndexChildren(catalog, tableName);
        }
    }

    List<TreeNode> loadIndexChildren(
                                     Connection connection,
                                     ConnectionEntity entity,
                                     String catalog,
                                     String tableName) throws SQLException {
        return loadIndexChildren(connection, entity, catalog, null, tableName);
    }

    List<TreeNode> loadIndexChildren(
                                     Connection connection,
                                     ConnectionEntity entity,
                                     String catalog,
                                     String schema,
                                     String tableName) throws SQLException {
        if (DbType.isCatalogSchemaFamily(entity.getDbType())) {
            return List.of();
        }
        SchemaScope scope = resolveScope(connection, entity.getDbType(), catalog, schema);
        return TableMetadataLoader.loadIndexNodes(connection.getMetaData(), entity.getId(), catalog, tableName, scope);
    }

    private List<TreeNode> listSchemasInCatalog(
                                                Connection connection,
                                                ConnectionEntity entity,
                                                String catalog) throws SQLException {
        String dbType = normalizeDbType(entity.getDbType());
        SchemaDialect dialect = dialectRegistry.resolve(dbType);
        if (DbType.isSqlServerFamily(dbType)) {
            return listSqlServerSchemas(connection, entity, catalog);
        }
        JdbcSchemaListingScopes.prepareCatalogConnection(connection, catalog, dbType, dialect);
        List<TreeNode> schemas = new ArrayList<>();
        DatabaseMetaData meta = connection.getMetaData();
        try (ResultSet rs = meta.getSchemas(catalog, null)) {
            while (rs.next()) {
                String schema = rs.getString("TABLE_SCHEM");
                if (schema == null || schema.isBlank()) {
                    continue;
                }
                if (ExplorerSchemaFilter.isSystemSchema(dbType, dialect, schema)) {
                    continue;
                }
                schemas.add(treeBuilder.buildSchemaNode(entity.getId(), catalog, schema));
            }
        }
        if (schemas.isEmpty()) {
            String fallback = connection.getSchema();
            if (fallback == null || fallback.isBlank()) {
                fallback = DbType.isSqlServerFamily(dbType) ? "dbo" : "default";
            }
            schemas.add(treeBuilder.buildSchemaNode(entity.getId(), catalog, fallback));
        }
        return schemas;
    }

    private List<TreeNode> listSqlServerSchemas(Connection connection, ConnectionEntity entity, String catalog) throws SQLException {
        List<TreeNode> schemas = new ArrayList<>();
        for (String schema : SqlServerCatalogSupport.listUserSchemaNames(connection, catalog)) {
            schemas.add(treeBuilder.buildSchemaNode(entity.getId(), catalog, schema));
        }
        return schemas;
    }

    private SchemaScope resolveScope(Connection connection, String dbType, String catalog) throws SQLException {
        SchemaDialect dialect = dialectRegistry.resolve(normalizeDbType(dbType));
        return dialect.resolveScope(connection, catalog);
    }

    private SchemaScope resolveScope(
                                     Connection connection,
                                     String dbType,
                                     String catalog,
                                     String schema) throws SQLException {
        SchemaDialect dialect = dialectRegistry.resolve(normalizeDbType(dbType));
        if (schema != null && !schema.isBlank()) {
            return dialect.resolveScope(connection, catalog, schema);
        }
        return dialect.resolveScope(connection, catalog);
    }

    private String normalizeDbType(String dbType) {
        return DbType.normalizeId(dbType);
    }

    private Connection openConnection(ConnectionEntity entity) throws SQLException {
        return jdbcQueryExecutor.openPreparedConnection(entity, null);
    }
}
