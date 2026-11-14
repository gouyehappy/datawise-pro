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
        if (kind == RelationKind.VIEW) {
            return loadViewProperties(connection, entity, database, relationName);
        }
        if (kind == RelationKind.TRIGGER || kind == RelationKind.FUNCTION || kind == RelationKind.PROCEDURE) {
            return emptyNamedProperties(relationName);
        }
        return loadProperties(connection, entity, database, relationName);
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
        if (kind == RelationKind.VIEW) {
            return loadViewDdl(connection, entity, database, relationName);
        }
        if (kind == RelationKind.TRIGGER) {
            return loadTriggerDdl(connection, entity, database, relationName);
        }
        if (kind == RelationKind.FUNCTION) {
            return loadFunctionDdl(connection, entity, database, relationName);
        }
        if (kind == RelationKind.PROCEDURE) {
            return loadProcedureDdl(connection, entity, database, relationName);
        }
        if (kind == RelationKind.SEQUENCE) {
            return loadSequenceDdl(connection, entity, database, relationName);
        }
        return loadDdl(connection, entity, database, relationName);
    }

    default TableDdlResult loadViewDdl(
                                       Connection connection,
                                       ConnectionEntity entity,
                                       String database,
                                       String viewName) throws SQLException {
        return loadDdl(connection, entity, database, viewName);
    }

    default TablePropertiesResult loadTriggerProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String triggerName
    ) throws SQLException {
        return emptyNamedProperties(triggerName);
    }

    /**
     * MetaForge B1：读取触发器 DDL。默认返回方言未实现提示；MySQL / PostgreSQL 等覆盖。
     */
    default TableDdlResult loadTriggerDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String triggerName
    ) throws SQLException {
        return unsupportedRoutineDdl(entity, "Trigger", triggerName);
    }

    default TableDdlResult loadFunctionDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String functionName
    ) throws SQLException {
        return unsupportedRoutineDdl(entity, "Function", functionName);
    }

    default TableDdlResult loadProcedureDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String procedureName
    ) throws SQLException {
        return unsupportedRoutineDdl(entity, "Procedure", procedureName);
    }

    default TableDdlResult loadSequenceDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String sequenceName
    ) throws SQLException {
        return unsupportedRoutineDdl(entity, "Sequence", sequenceName);
    }

    private static TablePropertiesResult emptyNamedProperties(String name) {
        return new TablePropertiesResult(
                name,
                null,
                null,
                null,
                null,
                null,
                java.util.List.of(),
                java.util.List.of(),
                java.util.List.of()
        );
    }

    private static TableDdlResult unsupportedRoutineDdl(ConnectionEntity entity, String kindLabel, String name) {
        String dbType = entity != null && entity.getDbType() != null ? entity.getDbType() : "unknown";
        return new TableDdlResult(
                "-- " + kindLabel + " DDL is not implemented for dbType=" + dbType + "\n"
                        + "-- " + kindLabel + ": " + name + "\n"
        );
    }

    default TableDefinition extractTableDefinition(
                                                   Connection connection,
                                                   ConnectionEntity entity,
                                                   String database,
                                                   String tableName) throws SQLException {
        throw new UnsupportedOperationException("extractTableDefinition is not implemented for dbType: " + entity.getDbType());
    }
}
