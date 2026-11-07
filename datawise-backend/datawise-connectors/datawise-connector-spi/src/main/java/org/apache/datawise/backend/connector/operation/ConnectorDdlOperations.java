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
