package org.apache.datawise.backend.connector.kylin.explorer;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.kylin.support.KylinMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.apache.datawise.backend.schema.introspect.SchemaTreeBuilder;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Apache Kylin Explorer: project node with OLAP tables listed via JDBC metadata. */
public final class KylinSchemaExplorer implements JdbcSchemaExplorer {

    private final SchemaTreeBuilder treeBuilder = new SchemaTreeBuilder();

    @Override
    public boolean supports(String dbType) {
        return DbType.KYLIN.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> introspectConnection(Connection connection, String connectionId) throws SQLException {
        String project = KylinMetadataSupport.resolveProject(connection);
        return List.of(treeBuilder.buildDatabaseNode(connectionId, project, List.of()));
    }

    @Override
    public List<TreeNode> loadDatabaseChildren(Connection connection, String connectionId, String catalog)
            throws SQLException {
        return treeBuilder.buildDatabaseChildren(connectionId, catalog, List.of());
    }

    @Override
    public List<TreeNode> listTables(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            boolean skeleton
    ) throws SQLException {
        List<TreeNode> tables = new ArrayList<>();
        for (String tableName : KylinMetadataSupport.listTables(connection)) {
            tables.add(toTableNode(connectionId, catalog, tableName, skeleton));
        }
        return tables;
    }

    @Override
    public List<TableColumnDetail> loadColumns(Connection connection, String database, String tableName)
            throws SQLException {
        return KylinMetadataSupport.loadColumns(connection, tableName);
    }

    @Override
    public String quoteQualifiedTable(String database, String tableName) {
        return KylinMetadataSupport.quoteQualifiedTable(database, tableName);
    }

    private TreeNode toTableNode(String connectionId, String catalog, String tableName, boolean skeleton) {
        TreeNode table = new TreeNode();
        table.setId(SchemaNodeIds.nodeId("table", connectionId, catalog, tableName));
        table.setLabel(tableName);
        table.setType("table");
        table.setExpanded(false);
        if (!skeleton) {
            table.setChildren(treeBuilder.buildTableSkeleton(connectionId, catalog, tableName));
        } else {
            table.setChildren(List.of());
        }
        return table;
    }
}
