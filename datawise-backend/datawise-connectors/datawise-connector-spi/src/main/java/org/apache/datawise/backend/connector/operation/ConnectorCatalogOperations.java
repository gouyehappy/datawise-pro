package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.SQLException;
import java.util.List;

/**
 * Explorer 树浏览。JDBC 类数据源 additionally 提供 {@link #openSchemaSession}。
 */
public interface ConnectorCatalogOperations {

    List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern);

    default boolean supportsSchemaTree() {
        return false;
    }

    default SchemaSession openSchemaSession(ConnectionEntity connection) throws SQLException {
        throw new UnsupportedOperationException("Schema tree is not supported");
    }
}
