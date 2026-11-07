package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.backend.domain.RelationKind;
import org.apache.datawise.backend.domain.SchemaRelationsResult;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRelationsResult;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.metadata.TableMetadataIntrospectorRegistry;
import org.apache.datawise.backend.metadata.jdbc.JdbcSchemaRelationsLoader;
import org.apache.datawise.backend.metadata.jdbc.JdbcSchemaTablesLoader;
import org.apache.datawise.backend.metadata.jdbc.JdbcTableRelationsLoader;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;

/** 表元数据读取入口：按 dbType 委托 {@link org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection}。 */
@Component
public class TableDetailIntrospector {

    private final TableMetadataIntrospectorRegistry introspectorRegistry;
    private final SchemaDialectRegistry dialectRegistry;

    public TableDetailIntrospector(
                                   TableMetadataIntrospectorRegistry introspectorRegistry,
                                   SchemaDialectRegistry dialectRegistry) {
        this.introspectorRegistry = introspectorRegistry;
        this.dialectRegistry = dialectRegistry;
    }

    public TablePropertiesResult loadProperties(
                                                Connection connection,
                                                ConnectionEntity entity,
                                                String database,
                                                String tableName) throws SQLException {
        return loadRelationProperties(connection, entity, database, tableName, RelationKind.TABLE);
    }

    public TablePropertiesResult loadRelationProperties(
                                                        Connection connection,
                                                        ConnectionEntity entity,
                                                        String database,
                                                        String relationName,
                                                        RelationKind kind) throws SQLException {
        return introspectorRegistry.require(entity.getDbType())
                .loadRelationProperties(connection, entity, database, relationName, kind);
    }

    public TablePropertiesResult loadViewProperties(
                                                    Connection connection,
                                                    ConnectionEntity entity,
                                                    String database,
                                                    String viewName) throws SQLException {
        return loadRelationProperties(connection, entity, database, viewName, RelationKind.VIEW);
    }

    public TableRelationsResult loadRelations(
                                              Connection connection,
                                              ConnectionEntity entity,
                                              String database,
                                              String tableName) throws SQLException {
        return JdbcTableRelationsLoader.load(connection, entity, database, tableName, dialectRegistry);
    }

    public SchemaRelationsResult loadSchemaRelations(
                                                     Connection connection,
                                                     ConnectionEntity entity,
                                                     String database) throws SQLException {
        return JdbcSchemaRelationsLoader.load(connection, entity, database, dialectRegistry);
    }

    public SchemaTablesResult loadSchemaTables(
                                               Connection connection,
                                               ConnectionEntity entity,
                                               String database) throws SQLException {
        return JdbcSchemaTablesLoader.load(connection, entity, database, dialectRegistry);
    }

    public TableDdlResult loadDdl(
                                  Connection connection,
                                  ConnectionEntity entity,
                                  String database,
                                  String tableName) throws SQLException {
        return loadRelationDdl(connection, entity, database, tableName, RelationKind.TABLE);
    }

    public TableDdlResult loadRelationDdl(
                                          Connection connection,
                                          ConnectionEntity entity,
                                          String database,
                                          String relationName,
                                          RelationKind kind) throws SQLException {
        return introspectorRegistry.require(entity.getDbType())
                .loadRelationDdl(connection, entity, database, relationName, kind);
    }

    public TableDdlResult loadViewDdl(
                                      Connection connection,
                                      ConnectionEntity entity,
                                      String database,
                                      String viewName) throws SQLException {
        return loadRelationDdl(connection, entity, database, viewName, RelationKind.VIEW);
    }

    public TableDefinition extractTableDefinition(
                                                  Connection connection,
                                                  ConnectionEntity entity,
                                                  String database,
                                                  String tableName) throws SQLException {
        return introspectorRegistry.require(entity.getDbType())
                .extractTableDefinition(connection, entity, database, tableName);
    }
}
