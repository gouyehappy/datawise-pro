package org.apache.datawise.backend.metadata.spi;

import org.apache.datawise.backend.domain.RelationKind;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRelationsResult;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.SQLException;

/** 方言表元数据读取 SPI（由 {@code connector-xxx} 实现）。 */
public interface TableMetadataIntrospection {

    boolean supports(String dbType);

    /** 数值越小优先级越高。 */
    default int priority() {
        return 100;
    }

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

    TableDdlResult loadDdl(
                           Connection connection,
                           ConnectionEntity entity,
                           String database,
                           String tableName) throws SQLException;

    default TableDdlResult loadRelationDdl(
                                           Connection connection,
                                           ConnectionEntity entity,
                                           String database,
                                           String relationName,
                                           RelationKind kind) throws SQLException {
        return kind == RelationKind.VIEW
                ? loadViewDdl(connection, entity, database, relationName)
                : loadDdl(connection, entity, database, relationName);
    }

    default TableDdlResult loadViewDdl(
                                       Connection connection,
                                       ConnectionEntity entity,
                                       String database,
                                       String viewName) throws SQLException {
        return loadDdl(connection, entity, database, viewName);
    }

    default TableDefinition extractTableDefinition(
                                                   Connection connection,
                                                   ConnectionEntity entity,
                                                   String database,
                                                   String tableName) throws SQLException {
        throw new UnsupportedOperationException("extractTableDefinition is not implemented for dbType: " + entity.getDbType());
    }
}
