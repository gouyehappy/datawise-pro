package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.ddl.DdlException;
import org.apache.datawise.backend.ddl.DdlErrorCode;
import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.ddl.DdlTranslateResult;
import org.apache.datawise.backend.domain.RelationKind;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

public interface ConnectorDdlOperations {

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

    private static TableDdlResult unsupportedRoutineDdl(ConnectionEntity entity, String kindLabel, String name) {
        String dbType = entity != null && entity.getDbType() != null ? entity.getDbType() : "unknown";
        return new TableDdlResult(
                "-- " + kindLabel + " DDL is not implemented for dbType=" + dbType + "\n"
                        + "-- " + kindLabel + ": " + name + "\n"
        );
    }

    default String renderCreateTable(TableDefinition definition, DdlRenderOptions options) {
        throw new DdlException(DdlErrorCode.RENDERER_NOT_FOUND, "DDL render is not implemented");
    }

    default DdlTranslateResult translateTables(
                                               Connection connection,
                                               ConnectionEntity source,
                                               String database,
                                               List<String> tableNames,
                                               String targetDbType,
                                               DdlRenderOptions options) throws SQLException {
        throw new DdlException(DdlErrorCode.INVALID_DEFINITION, "DDL translate is not implemented");
    }
}
