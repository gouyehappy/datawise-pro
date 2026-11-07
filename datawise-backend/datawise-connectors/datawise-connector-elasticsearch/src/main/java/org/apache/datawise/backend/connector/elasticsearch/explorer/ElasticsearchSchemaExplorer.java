package org.apache.datawise.backend.connector.elasticsearch.explorer;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.elasticsearch.support.ElasticsearchMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.apache.datawise.backend.schema.introspect.SchemaTreeBuilder;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Elasticsearch Explorer: indices as tables under a single cluster namespace. */
public final class ElasticsearchSchemaExplorer implements JdbcSchemaExplorer {

    private final SchemaTreeBuilder treeBuilder = new SchemaTreeBuilder();

    @Override
    public boolean supports(String dbType) {
        return DbType.ELASTICSEARCH.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> introspectConnection(Connection connection, String connectionId) throws SQLException {
        String namespace = ElasticsearchMetadataSupport.DEFAULT_NAMESPACE;
        return List.of(treeBuilder.buildDatabaseNode(connectionId, namespace, List.of()));
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
        for (String index : ElasticsearchMetadataSupport.listIndices(connection)) {
            tables.add(toTableNode(connectionId, catalog, index, skeleton));
        }
        return tables;
    }

    @Override
    public List<TableColumnDetail> loadColumns(Connection connection, String database, String tableName)
            throws SQLException {
        return ElasticsearchMetadataSupport.loadColumns(connection, tableName);
    }

    @Override
    public String quoteQualifiedTable(String database, String tableName) {
        return ElasticsearchMetadataSupport.quoteQualifiedTable(database, tableName);
    }

    private TreeNode toTableNode(String connectionId, String catalog, String indexName, boolean skeleton) {
        TreeNode table = new TreeNode();
        table.setId(SchemaNodeIds.nodeId("table", connectionId, catalog, indexName));
        table.setLabel(indexName);
        table.setType("table");
        table.setExpanded(false);
        if (!skeleton) {
            table.setChildren(treeBuilder.buildTableSkeleton(connectionId, catalog, indexName));
        } else {
            table.setChildren(List.of());
        }
        return table;
    }
}
