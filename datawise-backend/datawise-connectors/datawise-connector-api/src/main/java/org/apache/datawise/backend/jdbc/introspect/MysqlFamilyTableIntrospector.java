package org.apache.datawise.backend.jdbc.introspect;

import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TableForeignKeyDetail;
import org.apache.datawise.backend.domain.TableIndexDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.TableMetadataLoader;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * Shared information_schema + SHOW CREATE TABLE introspection for MySQL-family engines.
 */
public abstract class MysqlFamilyTableIntrospector implements TableMetadataIntrospection {

    private final MysqlFamilyIntrospectOptions options;

    protected MysqlFamilyTableIntrospector(MysqlFamilyIntrospectOptions options) {
        this.options = options;
    }

    @Override
    public TablePropertiesResult loadProperties(
                                                Connection connection,
                                                ConnectionEntity entity,
                                                String database,
                                                String tableName) throws SQLException {
        String catalog = TableMetadataSupport.resolveCatalog(connection, entity, database);
        return loadProperties(connection, catalog, tableName);
    }

    @Override
    public TableDdlResult loadDdl(
                                  Connection connection,
                                  ConnectionEntity entity,
                                  String database,
                                  String tableName) throws SQLException {
        String catalog = TableMetadataSupport.resolveCatalog(connection, entity, database);
        return loadDdl(connection, catalog, tableName);
    }

    @Override
    public TablePropertiesResult loadViewProperties(
                                                    Connection connection,
                                                    ConnectionEntity entity,
                                                    String database,
                                                    String viewName) throws SQLException {
        String catalog = TableMetadataSupport.resolveCatalog(connection, entity, database);
        return loadViewProperties(connection, catalog, viewName);
    }

    @Override
    public TableDdlResult loadViewDdl(
                                      Connection connection,
                                      ConnectionEntity entity,
                                      String database,
                                      String viewName) throws SQLException {
        String catalog = TableMetadataSupport.resolveCatalog(connection, entity, database);
        return loadViewDdl(connection, catalog, viewName);
    }

    @Override
    public TableDdlResult loadTriggerDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String triggerName
    ) throws SQLException {
        String catalog = TableMetadataSupport.resolveCatalog(connection, entity, database);
        return loadShowCreateRoutine(connection, catalog, triggerName, "TRIGGER", "SQL Original Statement");
    }

    @Override
    public TableDdlResult loadFunctionDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String functionName
    ) throws SQLException {
        String catalog = TableMetadataSupport.resolveCatalog(connection, entity, database);
        return loadShowCreateRoutine(connection, catalog, functionName, "FUNCTION", "Create Function");
    }

    @Override
    public TableDdlResult loadProcedureDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String procedureName
    ) throws SQLException {
        String catalog = TableMetadataSupport.resolveCatalog(connection, entity, database);
        return loadShowCreateRoutine(connection, catalog, procedureName, "PROCEDURE", "Create Procedure");
    }

    private TablePropertiesResult loadProperties(
                                                 Connection connection,
                                                 String catalog,
                                                 String tableName) throws SQLException {
        String engine = null;
        String comment = null;
        String autoIncrement = null;
        String collation = null;
        String charset = null;

        String tablesSql = options.includeAutoIncrement()
                ? """
                        SELECT ENGINE, TABLE_COMMENT, AUTO_INCREMENT, TABLE_COLLATION
                        FROM information_schema.TABLES
                        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                        """
                : """
                        SELECT ENGINE, TABLE_COMMENT, TABLE_COLLATION
                        FROM information_schema.TABLES
                        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                        """;

        try (PreparedStatement ps = connection.prepareStatement(tablesSql)) {
            ps.setString(1, catalog);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    engine = TableMetadataSupport.blankToNull(rs.getString("ENGINE"));
                    comment = TableMetadataSupport.blankToNull(rs.getString("TABLE_COMMENT"));
                    if (options.includeAutoIncrement()) {
                        long autoInc = rs.getLong("AUTO_INCREMENT");
                        if (!rs.wasNull()) {
                            autoIncrement = String.valueOf(autoInc);
                        }
                    }
                    collation = TableMetadataSupport.blankToNull(rs.getString("TABLE_COLLATION"));
                }
            }
        }

        if (options.resolveCharsetFromCollation() && collation != null) {
            charset = resolveCharsetFromCollation(connection, collation);
        }

        List<TableColumnDetail> columns = loadColumns(connection, catalog, tableName);

        SchemaScope scope = new SchemaScope(catalog, null, catalog);
        List<TableForeignKeyDetail> foreignKeys = TableMetadataSupport.mapForeignKeys(TableMetadataLoader.loadForeignKeyNodes(
                connection.getMetaData(), "", scope.catalogPattern(), tableName, scope));
        List<TableIndexDetail> indexes = TableMetadataSupport.mapIndexes(TableMetadataLoader.loadIndexNodes(
                connection.getMetaData(), "", scope.catalogPattern(), tableName, scope));

        return new TablePropertiesResult(
                tableName,
                comment,
                engine,
                charset,
                collation,
                autoIncrement,
                columns,
                foreignKeys,
                indexes);
    }

    private TablePropertiesResult loadViewProperties(Connection connection, String catalog, String viewName) throws SQLException {
        String comment = null;
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT TABLE_COMMENT
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'VIEW'
                """)) {
            ps.setString(1, catalog);
            ps.setString(2, viewName);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    comment = TableMetadataSupport.blankToNull(rs.getString("TABLE_COMMENT"));
                }
            }
        }
        List<TableColumnDetail> columns = loadColumns(connection, catalog, viewName);
        return new TablePropertiesResult(
                viewName,
                comment,
                null,
                null,
                null,
                null,
                columns,
                List.of(),
                List.of());
    }

    private List<TableColumnDetail> loadColumns(Connection connection, String catalog, String tableName) throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY,
                       COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT,
                       CHARACTER_SET_NAME, COLLATION_NAME
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
                """)) {
            ps.setString(1, catalog);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    columns.add(new TableColumnDetail(
                            rs.getInt("ORDINAL_POSITION"),
                            rs.getString("COLUMN_NAME"),
                            rs.getString("COLUMN_TYPE"),
                            "YES".equalsIgnoreCase(rs.getString("IS_NULLABLE")),
                            TableMetadataSupport.containsIgnoreCase(rs.getString("EXTRA"), "auto_increment"),
                            TableMetadataSupport.blankToNull(rs.getString("COLUMN_KEY")),
                            TableMetadataSupport.blankToNull(rs.getString("COLUMN_DEFAULT")),
                            TableMetadataSupport.blankToNull(rs.getString("EXTRA")),
                            TableMetadataSupport.blankToNull(rs.getString("COLUMN_COMMENT")),
                            TableMetadataSupport.blankToNull(rs.getString("CHARACTER_SET_NAME")),
                            TableMetadataSupport.blankToNull(rs.getString("COLLATION_NAME"))));
                }
            }
        }
        return columns;
    }

    private TableDdlResult loadDdl(Connection connection, String catalog, String tableName) throws SQLException {
        String sql = "SHOW CREATE TABLE " + qualifyBacktick(catalog, tableName);
        try (
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(sql)) {
            if (!rs.next()) {
                throw new IllegalArgumentException("Table not found: " + tableName);
            }
            String ddl = rs.getString(2);
            if (ddl == null || ddl.isBlank()) {
                ddl = rs.getString("Create Table");
            }
            return new TableDdlResult(ddl != null ? ddl : "");
        }
    }

    private TableDdlResult loadViewDdl(Connection connection, String catalog, String viewName) throws SQLException {
        String qualified = qualifyBacktick(catalog, viewName);
        String sql = "SHOW CREATE VIEW " + qualified;
        try (
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(sql)) {
            if (rs.next()) {
                String ddl = rs.getString(2);
                if (ddl == null || ddl.isBlank()) {
                    ddl = rs.getString("Create View");
                }
                if (ddl != null && !ddl.isBlank()) {
                    return new TableDdlResult(ddl);
                }
            }
        } catch (SQLException ignored) {
            // fall through to SHOW CREATE TABLE
        }
        return loadDdl(connection, catalog, viewName);
    }

    private TableDdlResult loadShowCreateRoutine(
            Connection connection,
            String catalog,
            String name,
            String objectKind,
            String preferredColumn
    ) throws SQLException {
        String sql = "SHOW CREATE " + objectKind + " " + qualifyBacktick(catalog, name);
        try (
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(sql)) {
            if (!rs.next()) {
                throw new IllegalArgumentException(objectKind + " not found: " + name);
            }
            String ddl = rs.getString(preferredColumn);
            if (ddl == null || ddl.isBlank()) {
                ddl = rs.getString(3);
            }
            if (ddl == null || ddl.isBlank()) {
                ddl = rs.getString(2);
            }
            return new TableDdlResult(ddl != null ? ddl : "");
        }
    }

    private static String qualifyBacktick(String catalog, String name) {
        if (catalog == null || catalog.isBlank()) {
            return "`" + escapeBacktick(name) + "`";
        }
        return "`" + escapeBacktick(catalog) + "`.`" + escapeBacktick(name) + "`";
    }

    private static String escapeBacktick(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        return value.replace("`", "``");
    }

    private String resolveCharsetFromCollation(Connection connection, String collation) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT CHARACTER_SET_NAME
                FROM information_schema.COLLATIONS
                WHERE COLLATION_NAME = ?
                LIMIT 1
                """)) {
            ps.setString(1, collation);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return TableMetadataSupport.blankToNull(rs.getString("CHARACTER_SET_NAME"));
                }
            }
        }
        return null;
    }
}
