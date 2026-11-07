package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.ddl.NamespaceDdlSupport;
import org.apache.datawise.backend.domain.CreateDatabaseRequest;
import org.apache.datawise.backend.domain.CreateNamespaceResult;
import org.apache.datawise.backend.domain.CreateSchemaRequest;
import org.apache.datawise.backend.domain.MysqlCharsetOptionsResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionAccessService;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/** CREATE DATABASE / CREATE SCHEMA for explorer, with schema-cache invalidation. */
@Service
public class CreateNamespaceService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final ConnectionAccessService connectionAccessService;
    private final ExplorerSchemaSessionPool schemaSessionPool;
    private final ExplorerTreeBuilder treeBuilder;

    public CreateNamespaceService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            ConnectionAccessService connectionAccessService,
            ExplorerSchemaSessionPool schemaSessionPool,
            ExplorerTreeBuilder treeBuilder
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.connectionAccessService = connectionAccessService;
        this.schemaSessionPool = schemaSessionPool;
        this.treeBuilder = treeBuilder;
    }

    public CreateNamespaceResult createDatabase(String connectionId, CreateDatabaseRequest request) {
        Resolved resolved = resolveForDdl(connectionId);
        String sql = NamespaceDdlSupport.buildCreateDatabaseSql(
                resolved.entity().getDbType(),
                request != null ? request.name() : null,
                request != null ? request.charset() : null,
                request != null ? request.collation() : null
        );
        return executeAndInvalidate(resolved, sql, NamespaceDdlSupport.requireValidName(request.name()), "database");
    }

    public CreateNamespaceResult deleteDatabase(String connectionId, String name) {
        Resolved resolved = resolveForDdl(connectionId);
        String sql = NamespaceDdlSupport.buildDropDatabaseSql(resolved.entity().getDbType(), name);
        return executeAndInvalidate(resolved, sql, NamespaceDdlSupport.requireValidName(name), "database");
    }

    public CreateNamespaceResult createSchema(String connectionId, CreateSchemaRequest request) {
        Resolved resolved = resolveForDdl(connectionId);
        String catalog = request != null ? request.catalog() : null;
        String sql = NamespaceDdlSupport.buildCreateSchemaSql(
                resolved.entity().getDbType(),
                request != null ? request.name() : null,
                catalog
        );
        String databaseForSession = catalog != null && !catalog.isBlank() ? catalog.trim() : null;
        return executeAndInvalidate(
                resolved,
                sql,
                NamespaceDdlSupport.requireValidName(request.name()),
                "schema",
                databaseForSession
        );
    }

    public MysqlCharsetOptionsResult listMysqlCharsetOptions(String connectionId) {
        Resolved resolved = resolveForRead(connectionId);
        if (!NamespaceDdlSupport.supportsMysqlCharsetOptions(resolved.entity().getDbType())) {
            throw new IllegalArgumentException(
                    "Character set options are only available for MySQL-family connections"
            );
        }
        try {
            return connectorFacade.jdbc().withConnection(resolved.entity(), null, connection -> {
                List<MysqlCharsetOptionsResult.MysqlCharsetOption> charsets = loadCharsets(connection);
                List<MysqlCharsetOptionsResult.MysqlCollationOption> collations = loadCollations(connection);
                return new MysqlCharsetOptionsResult(charsets, collations);
            });
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(resolved.entity(), ex);
        }
    }

    private CreateNamespaceResult executeAndInvalidate(
            Resolved resolved,
            String sql,
            String name,
            String kind
    ) {
        return executeAndInvalidate(resolved, sql, name, kind, null);
    }

    private CreateNamespaceResult executeAndInvalidate(
            Resolved resolved,
            String sql,
            String name,
            String kind,
            String database
    ) {
        try {
            TableRowMutateResult result = connectorFacade.jdbc().executeUpdate(
                    resolved.entity(),
                    sql,
                    database
            );
            invalidateCatalogCache(resolved.connectionId());
            return new CreateNamespaceResult(name, kind, result.sql() != null ? result.sql() : sql, true);
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(resolved.entity(), ex);
        }
    }

    private void invalidateCatalogCache(String connectionId) {
        schemaSessionPool.invalidate(connectionId);
        treeBuilder.saveSchemaChildren(connectionId, List.of());
    }

    private Resolved resolveForDdl(String connectionId) {
        ConnectionExecutionContext.ResolvedConnection resolved =
                connectionContext.requireAvailableConnectionForCurrentUser(
                        connectionId,
                        "Connection not found: " + connectionId
                );
        connectionAccessService.requireDdlAccess(resolved.userId(), connectionId);
        ConnectorCapabilityGuard.requireSqlExecute(connectorFacade, resolved.entity());
        return new Resolved(connectionId, resolved.entity());
    }

    private Resolved resolveForRead(String connectionId) {
        ConnectionExecutionContext.ResolvedConnection resolved =
                connectionContext.requireAvailableConnectionForCurrentUser(
                        connectionId,
                        "Connection not found: " + connectionId
                );
        ConnectorCapabilityGuard.requireSqlExecute(connectorFacade, resolved.entity());
        return new Resolved(connectionId, resolved.entity());
    }

    private static List<MysqlCharsetOptionsResult.MysqlCharsetOption> loadCharsets(Connection connection)
            throws SQLException {
        List<MysqlCharsetOptionsResult.MysqlCharsetOption> rows = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SHOW CHARACTER SET")) {
            while (rs.next()) {
                rows.add(new MysqlCharsetOptionsResult.MysqlCharsetOption(
                        rs.getString(1),
                        columnOrEmpty(rs, 2),
                        columnOrEmpty(rs, 3)
                ));
            }
        }
        return rows;
    }

    private static List<MysqlCharsetOptionsResult.MysqlCollationOption> loadCollations(Connection connection)
            throws SQLException {
        List<MysqlCharsetOptionsResult.MysqlCollationOption> rows = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SHOW COLLATION")) {
            while (rs.next()) {
                String name = rs.getString(1);
                String charset = columnOrEmpty(rs, 2);
                boolean isDefault = false;
                try {
                    String flag = rs.getString("Default");
                    isDefault = flag != null && flag.equalsIgnoreCase("Yes");
                } catch (SQLException ignored) {
                    // column layout may differ by engine
                }
                rows.add(new MysqlCharsetOptionsResult.MysqlCollationOption(name, charset, isDefault));
            }
        }
        return rows;
    }

    private static String columnOrEmpty(ResultSet rs, int index) {
        try {
            String value = rs.getString(index);
            return value != null ? value : "";
        } catch (SQLException ex) {
            return "";
        }
    }

    private record Resolved(String connectionId, ConnectionEntity entity) {
    }
}
