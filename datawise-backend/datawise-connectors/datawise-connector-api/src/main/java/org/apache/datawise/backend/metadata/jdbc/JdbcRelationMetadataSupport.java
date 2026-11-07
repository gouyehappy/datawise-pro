package org.apache.datawise.backend.metadata.jdbc;

import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.TableMetadataLoader;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Shared JDBC helpers for database view metadata (columns, comment, DDL). */
public final class JdbcRelationMetadataSupport {

    public static final String[] JDBC_VIEW_TYPES = {"VIEW", "VIRTUAL_VIEW", "MATERIALIZED_VIEW"};

    private JdbcRelationMetadataSupport() {
    }

    public static String loadViewComment(DatabaseMetaData meta, SchemaScope scope, String viewName) throws SQLException {
        for (String[] types : new String[][]{JDBC_VIEW_TYPES, new String[]{"VIEW"}}) {
            try (
                    ResultSet rs = meta.getTables(
                            scope.catalogPattern(),
                            scope.schemaPattern(),
                            viewName,
                            types)) {
                if (rs.next()) {
                    String remarks = resultString(rs, "REMARKS", "remarks");
                    if (remarks != null && !remarks.isBlank()) {
                        return remarks.trim();
                    }
                }
            }
        }
        return null;
    }

    public static List<TableColumnDetail> loadViewColumns(
                                                          DatabaseMetaData meta,
                                                          SchemaScope scope,
                                                          String viewName) throws SQLException {
        Set<String> primaryKeys = loadPrimaryKeysSafely(meta, scope, viewName);
        List<TableColumnDetail> columns = new ArrayList<>();
        int ordinal = 0;
        try (ResultSet rs = meta.getColumns(scope.catalogPattern(), scope.schemaPattern(), viewName, "%")) {
            while (rs.next()) {
                ordinal++;
                String columnName = resultString(rs, "COLUMN_NAME", "column_name");
                String typeName = resultString(rs, "TYPE_NAME", "type_name");
                int columnSize = resultInt(rs, "COLUMN_SIZE", "column_size");
                int decimalDigits = resultInt(rs, "DECIMAL_DIGITS", "decimal_digits");
                boolean nullable = resultInt(rs, "NULLABLE", "nullable") != DatabaseMetaData.columnNoNulls;
                String defaultValue = TableMetadataSupport.blankToNull(
                        resultString(rs, "COLUMN_DEF", "column_def"));
                String remarks = TableMetadataSupport.blankToNull(
                        resultString(rs, "REMARKS", "remarks"));
                String autoIncRaw = resultString(rs, "IS_AUTOINCREMENT", "is_autoincrement", "is_auto_increment");
                boolean autoIncrement = "YES".equalsIgnoreCase(autoIncRaw);
                String keyType = primaryKeys.contains(columnName.toLowerCase(Locale.ROOT)) ? "PRI" : null;
                columns.add(new TableColumnDetail(
                        ordinal,
                        columnName,
                        TableMetadataSupport.formatDataType(typeName, columnSize, decimalDigits),
                        nullable,
                        autoIncrement,
                        keyType,
                        defaultValue,
                        autoIncrement ? "auto_increment" : null,
                        remarks));
            }
        }
        return columns;
    }

    public static String loadViewDdlGeneric(Connection connection, String catalog, String viewName) throws SQLException {
        String qualified = qualifyBacktick(catalog, viewName);
        String ddl = tryShowCreate(connection, "SHOW CREATE VIEW " + qualified);
        if (ddl != null) {
            return ddl;
        }
        ddl = tryShowCreate(connection, "SHOW CREATE TABLE " + qualified);
        if (ddl != null) {
            return ddl;
        }
        if (catalog != null && !catalog.isBlank()) {
            ddl = tryShowCreate(connection, "SHOW CREATE VIEW `" + escapeBacktick(viewName) + "`");
            if (ddl != null) {
                return ddl;
            }
            ddl = tryShowCreate(connection, "SHOW CREATE TABLE `" + escapeBacktick(viewName) + "`");
            if (ddl != null) {
                return ddl;
            }
        }
        throw new IllegalArgumentException("View DDL is not available for: " + viewName);
    }

    public static String loadPostgresqlViewDdl(Connection connection, String schema, String viewName) throws SQLException {
        String sql = """
                SELECT pg_get_viewdef(c.oid, true) AS definition
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('v', 'm') AND n.nspname = ? AND c.relname = ?
                """;
        try (var ps = connection.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, viewName);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalArgumentException("View not found: " + schema + "." + viewName);
                }
                String definition = rs.getString("definition");
                if (definition == null || definition.isBlank()) {
                    throw new IllegalArgumentException("View definition is empty: " + schema + "." + viewName);
                }
                return "CREATE OR REPLACE VIEW "
                        + quotePgIdentifier(schema) + "." + quotePgIdentifier(viewName)
                        + " AS\n"
                        + definition.trim();
            }
        }
    }

    public static String loadTrinoViewDdl(Connection connection, String qualifiedName) throws SQLException {
        String sql = "SHOW CREATE VIEW " + qualifiedName;
        try (
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(sql)) {
            if (!rs.next()) {
                throw new IllegalArgumentException("View not found: " + qualifiedName);
            }
            String ddl = rs.getString(1);
            if (ddl == null || ddl.isBlank()) {
                ddl = rs.getString("Create View");
            }
            return ddl != null ? ddl : "";
        }
    }

    private static Set<String> loadPrimaryKeysSafely(DatabaseMetaData meta, SchemaScope scope, String viewName) {
        try {
            return TableMetadataLoader.loadPrimaryKeyColumnNames(meta, scope, viewName);
        } catch (SQLException ex) {
            return Set.of();
        }
    }

    private static String tryShowCreate(Connection connection, String sql) {
        try (
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(sql)) {
            if (!rs.next()) {
                return null;
            }
            for (int index = 1; index <= rs.getMetaData().getColumnCount(); index++) {
                String label = rs.getMetaData().getColumnLabel(index);
                if (label != null && label.toLowerCase(Locale.ROOT).contains("create")) {
                    String value = rs.getString(index);
                    if (value != null && !value.isBlank()) {
                        return value;
                    }
                }
            }
            String second = rs.getString(2);
            if (second != null && !second.isBlank()) {
                return second;
            }
            String first = rs.getString(1);
            return first != null && !first.isBlank() ? first : null;
        } catch (SQLException ex) {
            return null;
        }
    }

    private static String qualifyBacktick(String catalog, String viewName) {
        if (catalog == null || catalog.isBlank()) {
            return "`" + escapeBacktick(viewName) + "`";
        }
        return "`" + escapeBacktick(catalog) + "`.`" + escapeBacktick(viewName) + "`";
    }

    private static String escapeBacktick(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        // MySQL identifier escape: double embedded backticks (do not strip)
        return value.replace("`", "``");
    }

    private static String quotePgIdentifier(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private static String resultString(ResultSet rs, String... labels) throws SQLException {
        for (String label : labels) {
            try {
                String value = rs.getString(label);
                if (value != null) {
                    return value;
                }
            } catch (SQLException ignored) {
                // try next label
            }
        }
        return null;
    }

    private static int resultInt(ResultSet rs, String... labels) throws SQLException {
        for (String label : labels) {
            try {
                return rs.getInt(label);
            } catch (SQLException ignored) {
                // try next label
            }
        }
        return 0;
    }
}
