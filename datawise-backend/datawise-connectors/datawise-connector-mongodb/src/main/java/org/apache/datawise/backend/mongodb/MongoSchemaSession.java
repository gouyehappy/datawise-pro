package org.apache.datawise.backend.mongodb;

import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.connector.mongodb.support.MongoConnectionSupport;
import org.apache.datawise.backend.connector.mongodb.support.MongoDocumentSupport;

import java.sql.SQLException;
import java.util.List;

/** Explorer schema session backed by the MongoDB Java driver. */
public final class MongoSchemaSession implements SchemaSession {

    private final ConnectionEntity entity;

    public MongoSchemaSession(ConnectionEntity entity) {
        this.entity = entity;
    }

    @Override
    public void close() {
        // Each operation opens a short-lived client; nothing to close here.
    }

    @Override
    public List<TreeNode> introspectConnection() throws SQLException {
        try {
            return MongoConnectionSupport.buildDatabaseNodes(
                    entity.getId(),
                    MongoConnectionSupport.listDatabases(entity)
            );
        } catch (Exception ex) {
            throw new SQLException(ex.getMessage(), ex);
        }
    }

    @Override
    public List<TreeNode> loadDatabaseChildren(String catalog) throws SQLException {
        try {
            return MongoConnectionSupport.buildDatabaseChildren(
                    entity.getId(),
                    catalog,
                    MongoConnectionSupport.listCollections(entity, catalog)
            );
        } catch (Exception ex) {
            throw new SQLException(ex.getMessage(), ex);
        }
    }

    @Override
    public List<TreeNode> loadTableList(String catalog) throws SQLException {
        try {
            return MongoConnectionSupport.buildCollectionNodes(
                    entity.getId(),
                    catalog,
                    MongoConnectionSupport.listCollections(entity, catalog)
            );
        } catch (Exception ex) {
            throw new SQLException(ex.getMessage(), ex);
        }
    }

    @Override
    public List<TreeNode> loadTableSkeletonChildren(String catalog, String tableName) {
        return MongoConnectionSupport.buildTableSkeletonChildren(entity.getId(), catalog, tableName);
    }

    @Override
    public List<TreeNode> loadColumnChildren(String catalog, String tableName) throws SQLException {
        try {
            return MongoDocumentSupport.loadCollectionFieldNodes(
                    entity,
                    entity.getId(),
                    catalog,
                    tableName
            );
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
