package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.RelationKind;
import org.apache.datawise.backend.domain.SchemaRelationsResult;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRelationsResult;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.SQLException;

public interface ConnectorMetadataOperations {

    TablePropertiesResult loadProperties(
                                         Connection connection,
                                         ConnectionEntity entity,
                                         String database,
                                         String tableName) throws SQLException;

    default TablePropertiesResult loadRelationProperties(
                                                         Connection connection,
                                                         ConnectionEntity entity,
                                                         String database,
                                                         String relationName,
                                                         RelationKind kind) throws SQLException {
        return kind == RelationKind.VIEW
                ? loadViewProperties(connection, entity, database, relationName)
                : loadProperties(connection, entity, database, relationName);
    }

    default TablePropertiesResult loadViewProperties(
                                                     Connection connection,
                                                     ConnectionEntity entity,
                                                     String database,
                                                     String viewName) throws SQLException {
        return loadProperties(connection, entity, database, viewName);
    }

    default TableRelationsResult loadRelations(
                                               Connection connection,
                                               ConnectionEntity entity,
                                               String database,
                                               String tableName) throws SQLException {
        return new TableRelationsResult(tableName, java.util.List.of(), java.util.List.of());
    }

    default SchemaRelationsResult loadSchemaRelations(
                                                      Connection connection,
                                                      ConnectionEntity entity,
                                                      String database) throws SQLException {
        return new SchemaRelationsResult(database, java.util.List.of(), java.util.List.of());
    }

    default SchemaTablesResult loadSchemaTables(
                                                Connection connection,
                                                ConnectionEntity entity,
                                                String database) throws SQLException {
        return new SchemaTablesResult(database, java.util.List.of());
    }

    /**
     * 提取引擎无关表模型，供 DDL 渲染/跨库转换使用。未实现时抛出 {@link UnsupportedOperationException}。
     */
    default TableDefinition extractTableDefinition(
                                                   Connection connection,
                                                   ConnectionEntity entity,
                                                   String database,
                                                   String tableName) throws SQLException {
        throw new UnsupportedOperationException("TableDefinition extraction is not implemented for " + entity.getDbType());
    }
}
