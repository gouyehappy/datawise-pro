package org.apache.datawise.backend.kudu;

import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.connector.kudu.support.KuduConnectionSupport;
import org.apache.datawise.backend.connector.kudu.support.KuduTableSupport;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.SQLException;
import java.util.List;

/** Explorer schema session backed by the native Kudu client. */
public final class KuduSchemaSession implements SchemaSession {

    private final ConnectionEntity entity;

    public KuduSchemaSession(ConnectionEntity entity) {
        this.entity = entity;
    }

    @Override
    public void close() {
        // Each operation opens a short-lived client; nothing to close here.
    }

    @Override
    public List<TreeNode> introspectConnection() throws SQLException {
        try {
            return KuduConnectionSupport.buildDatabaseNodes(
                    entity.getId(),
                    List.of(KuduConnectionSupport.DEFAULT_CATALOG)
            );
        } catch (Exception ex) {
            throw new SQLException(ex.getMessage(), ex);
        }
    }

    @Override
    public List<TreeNode> loadDatabaseChildren(String catalog) throws SQLException {
        try {
            String resolved = KuduConnectionSupport.resolveCatalog(catalog);
            return KuduConnectionSupport.buildDatabaseChildren(
                    entity.getId(),
                    resolved,
                    KuduConnectionSupport.listTables(entity)
            );
        } catch (Exception ex) {
            throw new SQLException(ex.getMessage(), ex);
        }
    }

    @Override
    public List<TreeNode> loadTableList(String catalog) throws SQLException {
        try {
            String resolved = KuduConnectionSupport.resolveCatalog(catalog);
            return KuduConnectionSupport.buildTableNodes(
                    entity.getId(),
                    resolved,
                    KuduConnectionSupport.listTables(entity)
            );
        } catch (Exception ex) {
            throw new SQLException(ex.getMessage(), ex);
        }
    }

    @Override
    public List<TreeNode> loadTableSkeletonChildren(String catalog, String tableName) {
        return KuduConnectionSupport.buildTableSkeletonChildren(entity.getId(), catalog, tableName);
    }

    @Override
    public List<TreeNode> loadColumnChildren(String catalog, String tableName) throws SQLException {
        try {
            return KuduTableSupport.loadColumnNodes(entity, entity.getId(), catalog, tableName);
        } catch (RuntimeException ex) {
            throw new SQLException(ex.getMessage(), ex);
        }
    }

    @Override
    public List<TreeNode> loadKeyChildren(String catalog, String tableName) {
        return List.of();
    }

    @Override
    public List<TreeNode> loadIndexChildren(String catalog, String tableName) {
        return List.of();
    }

    @Override
    public String connectionId() {
        return entity.getId();
    }
}
