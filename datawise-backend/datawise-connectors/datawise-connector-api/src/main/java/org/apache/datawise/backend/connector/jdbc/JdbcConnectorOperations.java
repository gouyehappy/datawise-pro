package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDdlOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMetadataOperations;
import org.apache.datawise.backend.common.ExplorerConnectionException;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.RelationKind;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRelationsResult;
import org.apache.datawise.backend.domain.SchemaRelationsResult;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.ddl.DdlErrorCode;
import org.apache.datawise.backend.ddl.DdlException;
import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.ddl.DialectDdlRendererRegistry;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.connection.JdbcUrlBuilder;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.jdbc.execution.JdbcQueryExecutor;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaIntrospector;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.connector.api.support.TableDetailIntrospector;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/**
 * JDBC 连接器共享实现。各 {@link org.apache.datawise.backend.connector.DataSourceConnector} 委托本类。
 */
@Component
public class JdbcConnectorOperations
        implements
            ConnectorJdbcOperations {

    private static final Logger log = LoggerFactory.getLogger(JdbcConnectorOperations.class);

    private final JdbcQueryExecutor jdbcQueryExecutor;
    private final JdbcSchemaIntrospector schemaIntrospector;
    private final TableDetailIntrospector tableDetailIntrospector;
    private final DialectDdlRendererRegistry ddlRendererRegistry;

    public JdbcConnectorOperations(
                                   JdbcQueryExecutor jdbcQueryExecutor,
                                   JdbcSchemaIntrospector schemaIntrospector,
                                   TableDetailIntrospector tableDetailIntrospector,
                                   DialectDdlRendererRegistry ddlRendererRegistry) {
        this.jdbcQueryExecutor = jdbcQueryExecutor;
        this.schemaIntrospector = schemaIntrospector;
        this.tableDetailIntrospector = tableDetailIntrospector;
        this.ddlRendererRegistry = ddlRendererRegistry;
    }

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            jdbcQueryExecutor.canConnect(entity);
            long latency = System.currentTimeMillis() - start;
            String message = String.format(
                    "Connected to %s (%s) in %dms",
                    entity.getName(),
                    JdbcUrlBuilder.buildJdbcUrl(entity),
                    latency);
            return new ConnectionTestResult(true, message, latency);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "JDBC connection test failed for " + entity.getName(), ex);
            long latency = System.currentTimeMillis() - start;
            String message = String.format(
                    "Cannot connect to %s (%s): %s",
                    entity.getName(),
                    entity.getHost(),
                    ex.getMessage());
            return new ConnectionTestResult(false, message, latency);
        }
    }

    @Override
    public ConnectionTestResult ping(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            jdbcQueryExecutor.canConnect(entity);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    true,
                    String.format("Reachable %s in %dms", entity.getName(), latency),
                    latency);
        } catch (Exception ex) {
            // 网络不可达/休眠唤醒后失败是探活常态，只记一行，避免刷整栈
            log.warn(
                    "JDBC ping failed for {} | errorType={} | error={}",
                    entity.getName(),
                    ex.getClass().getSimpleName(),
                    ex.getMessage() != null ? ex.getMessage().replaceAll("\\s+", " ").trim() : "");
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    false,
                    String.format("Cannot reach %s: %s", entity.getName(), ex.getMessage()),
                    latency);
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        try {
            return schemaIntrospector.introspectConnection(connection);
        } catch (SQLException ex) {
            String message = JdbcConnectionErrors.toUserMessage(ex);
            String errorCode = JdbcConnectionErrors.classifyErrorCode(ex);
            if (errorCode == null && JdbcConnectionErrors.isDriverRelated(ex)) {
                errorCode = JdbcConnectionErrors.ERROR_CODE_JDBC_DRIVER_LOAD;
            }
            if (errorCode == null) {
                errorCode = "CONNECTION_INTROSPECT_FAILED";
            }
            throw new ExplorerConnectionException(message, errorCode, ex);
        }
    }

    @Override
    public boolean supportsSchemaTree() {
        return true;
    }

    @Override
    public SchemaSession openSchemaSession(ConnectionEntity connection) throws SQLException {
        return schemaIntrospector.openSession(connection);
    }

    @Override
    public TablePropertiesResult loadProperties(
                                                Connection connection,
                                                ConnectionEntity entity,
                                                String database,
                                                String tableName) throws SQLException {
        return loadRelationProperties(connection, entity, database, tableName, RelationKind.TABLE);
    }

    @Override
    public TablePropertiesResult loadRelationProperties(
                                                        Connection connection,
                                                        ConnectionEntity entity,
                                                        String database,
                                                        String relationName,
                                                        RelationKind kind) throws SQLException {
        return tableDetailIntrospector.loadRelationProperties(
                connection,
                entity,
                database,
                relationName,
                kind);
    }

    @Override
    public TableRelationsResult loadRelations(
                                              Connection connection,
                                              ConnectionEntity entity,
                                              String database,
                                              String tableName) throws SQLException {
        return tableDetailIntrospector.loadRelations(connection, entity, database, tableName);
    }

    @Override
    public SchemaRelationsResult loadSchemaRelations(
                                                     Connection connection,
                                                     ConnectionEntity entity,
                                                     String database) throws SQLException {
        return tableDetailIntrospector.loadSchemaRelations(connection, entity, database);
    }

    @Override
    public SchemaTablesResult loadSchemaTables(
                                               Connection connection,
                                               ConnectionEntity entity,
                                               String database) throws SQLException {
        return tableDetailIntrospector.loadSchemaTables(connection, entity, database);
    }

    @Override
    public TableDdlResult loadDdl(
                                  Connection connection,
                                  ConnectionEntity entity,
                                  String database,
                                  String tableName) throws SQLException {
        return loadRelationDdl(connection, entity, database, tableName, RelationKind.TABLE);
    }

    @Override
    public TableDdlResult loadRelationDdl(
                                          Connection connection,
                                          ConnectionEntity entity,
                                          String database,
                                          String relationName,
                                          RelationKind kind) throws SQLException {
        return tableDetailIntrospector.loadRelationDdl(connection, entity, database, relationName, kind);
    }

    @Override
    public String renderCreateTable(TableDefinition definition, DdlRenderOptions options) {
        if (options == null || options.targetDbType() == null || options.targetDbType().isBlank()) {
            throw new DdlException(DdlErrorCode.INVALID_DEFINITION, "targetDbType is required for DDL render");
        }
        return ddlRendererRegistry.renderCreateTable(definition, options.targetDbType(), options);
    }
}
