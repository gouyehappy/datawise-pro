package org.apache.datawise.backend.connector.hive.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.schema.CatalogSchemaScope;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Hive JDBC metadata helpers (scope, columns, qualified names). */
public final class HiveMetadataSupport {

    /** Legacy Explorer fallback label when {@link DatabaseMetaData#getCatalogs()} is empty. */
    public static final String SYNTHETIC_CATALOG_FALLBACK = "main";

    private static final String[] JDBC_TABLE_TYPES = {"TABLE", "MANAGED_TABLE", "EXTERNAL_TABLE"};
    private static final String[] JDBC_VIEW_TYPES = {"VIEW", "VIRTUAL_VIEW"};

    private static final Pattern DOT_IN_BACKTICKS =
            Pattern.compile("(?i)(CREATE\\s+TABLE\\s+)`([^`]+)\\.([^`]+)`");

    private HiveMetadataSupport() {
    }

    public record HiveTableScope(String catalog, String database) {
        public String databaseLabel() {
            if (catalog != null && !catalog.isBlank() && database != null && !database.isBlank()) {
                return catalog.trim() + "." + database.trim();
            }
            if (database != null && !database.isBlank()) {
                return database.trim();
            }
            return catalog != null ? catalog.trim() : "";
        }
    }

    public static boolean hasRealCatalogs(Connection connection) throws SQLException {
        try (ResultSet rs = connection.getMetaData().getCatalogs()) {
            while (rs.next()) {
                String catalog = rs.getString("TABLE_CAT");
                if (catalog != null && !catalog.isBlank()) {
                    return true;
                }
            }
        }
        return false;
    }

    public static HiveTableScope resolveTableScope(Connection connection, String database) throws SQLException {
        CatalogSchemaScope parsed = CatalogSchemaScope.parse(database);
        if (hasRealCatalogs(connection)) {
            if (parsed.hasSchema()) {
                return new HiveTableScope(parsed.catalog(), parsed.schema());
            }
            return new HiveTableScope(parsed.catalog(), null);
        }
        if (parsed.hasSchema()) {
            if (SYNTHETIC_CATALOG_FALLBACK.equalsIgnoreCase(parsed.catalog())) {
                return new HiveTableScope(null, parsed.schema());
            }
            return new HiveTableScope(parsed.catalog(), parsed.schema());
        }
        return new HiveTableScope(null, parsed.catalog());
    }

    public static String quoteQualifiedTable(String database, String tableName) {
        String table = DbType.HIVE.quoteName(tableName);
        CatalogSchemaScope parsed = CatalogSchemaScope.parse(database);
        if (parsed.hasSchema()) {
            if (SYNTHETIC_CATALOG_FALLBACK.equalsIgnoreCase(parsed.catalog())) {
                return DbType.HIVE.quoteName(parsed.schema()) + "." + table;
            }
            return DbType.HIVE.quoteName(parsed.catalog())
                    + "."
                    + DbType.HIVE.quoteName(parsed.schema())
                    + "."
                    + table;
        }
        if (parsed.catalog() != null && !parsed.catalog().isBlank()) {
            return DbType.HIVE.quoteName(parsed.catalog()) + "." + table;
        }
        return table;
    }

    public static String unqualifiedTableName(String database, String tableName) {
        HiveTableScope scope = parseScope(database);
        String namespace = scope.databaseLabel();
        if (namespace.isBlank()) {
            return tableName;
        }
        return namespace + "." + tableName;
    }

    public static List<TableColumnDetail> loadColumns(
            Connection connection,
            String database,
            String tableName
    ) throws SQLException {
        HiveTableScope scope = resolveTableScope(connection, database);
        applyScope(connection, scope);
        List<TableColumnDetail> columns = loadColumnsViaMetadata(connection, scope, tableName);
        if (!columns.isEmpty()) {
            return columns;
        }
        return loadColumnsViaDescribe(connection, database, tableName);
    }

    public static String loadDdl(Connection connection, String database, String tableName) throws SQLException {
        HiveTableScope scope = resolveTableScope(connection, database);
        applyScope(connection, scope);
        String qualified = quoteQualifiedTable(database, tableName);
        List<String> targets = List.of(
                unqualifiedTableName(database, tableName),
                qualified,
                DbType.HIVE.quoteName(tableName)
        );
        for (String target : targets) {
            if (target == null || target.isBlank()) {
                continue;
            }
            String raw = executeShowCreateTable(connection, target);
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String normalized = normalizeHiveCreateTableDdl(database, tableName, raw);
            if (isUsableCreateTableDdl(normalized)) {
                return normalized;
            }
        }
        List<TableColumnDetail> columns = loadColumns(connection, database, tableName);
        return synthesizeCreateTableDdl(database, tableName, columns);
    }

    static String normalizeHiveCreateTableDdl(String database, String tableName, String ddl) {
        if (ddl == null || ddl.isBlank()) {
            return ddl;
        }
        String normalized = ddl.trim();
        Matcher matcher = DOT_IN_BACKTICKS.matcher(normalized);
        if (matcher.find()) {
            normalized = matcher.replaceFirst(
                    "$1" + quoteQualifiedTable(database, tableName)
            );
        }
        String qualified = quoteQualifiedTable(database, tableName);
        HiveTableScope scope = parseScope(database);
        String namespace = scope.databaseLabel();
        if (!namespace.isBlank()) {
            String unquoted = namespace + "." + tableName;
            normalized = normalized.replaceFirst(
                    "(?i)CREATE\\s+TABLE\\s+" + Pattern.quote(unquoted),
                    "CREATE TABLE " + qualified
            );
        }
        return normalized;
    }

    static String synthesizeCreateTableDdl(
            String database,
            String tableName,
            List<TableColumnDetail> columns
    ) {
        if (columns.isEmpty()) {
            return "";
        }
        String qualified = quoteQualifiedTable(database, tableName);
        StringBuilder sb = new StringBuilder("CREATE TABLE ").append(qualified).append(" (\n");
        for (int i = 0; i < columns.size(); i++) {
            TableColumnDetail column = columns.get(i);
            if (i > 0) {
                sb.append(",\n");
            }
            sb.append("  ")
                    .append(DbType.HIVE.quoteName(column.name()))
                    .append(' ')
                    .append(column.dataType() != null && !column.dataType().isBlank()
                            ? column.dataType()
                            : "string");
            if (column.comment() != null && !column.comment().isBlank()) {
                sb.append(" COMMENT '")
                        .append(column.comment().replace("'", "\\'"))
                        .append('\'');
            }
        }
        sb.append("\n)");
        return sb.toString();
    }

    private static String executeShowCreateTable(Connection connection, String target) throws SQLException {
        String sql = "SHOW CREATE TABLE " + target;
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            if (!rs.next()) {
                return null;
            }
            String ddl = rs.getString(1);
            if (ddl == null || ddl.isBlank()) {
                ddl = resultString(rs, "createtab_stmt", "Createtab Stmt");
            }
            return ddl;
        } catch (SQLException ex) {
            return null;
        }
    }

    private static boolean isUsableCreateTableDdl(String ddl) {
        if (ddl == null || ddl.isBlank()) {
            return false;
        }
        int open = ddl.indexOf('(');
        if (open < 0) {
            return false;
        }
        int close = ddl.lastIndexOf(')');
        if (close <= open) {
            return false;
        }
        return !ddl.substring(open + 1, close).isBlank();
    }

    private static HiveTableScope parseScope(String database) {
        CatalogSchemaScope parsed = CatalogSchemaScope.parse(database);
        if (parsed.hasSchema()) {
            if (SYNTHETIC_CATALOG_FALLBACK.equalsIgnoreCase(parsed.catalog())) {
                return new HiveTableScope(null, parsed.schema());
            }
            return new HiveTableScope(parsed.catalog(), parsed.schema());
        }
        return new HiveTableScope(null, parsed.catalog());
    }

    private static List<TableColumnDetail> loadColumnsViaMetadata(
            Connection connection,
            HiveTableScope scope,
            String tableName
    ) throws SQLException {
        DatabaseMetaData meta = connection.getMetaData();
        for (String[] probe : metadataProbes(scope)) {
            List<TableColumnDetail> columns = readColumns(meta, probe[0], probe[1], tableName);
            if (!columns.isEmpty()) {
                return columns;
            }
        }
        return List.of();
    }

    private static List<TableColumnDetail> readColumns(
            DatabaseMetaData meta,
            String catalogPattern,
            String schemaPattern,
            String tableName
    ) throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        int ordinal = 0;
        try (ResultSet rs = meta.getColumns(catalogPattern, schemaPattern, tableName, "%")) {
            while (rs.next()) {
                String columnName = resultString(rs, "COLUMN_NAME", "column_name");
                if (columnName == null || columnName.isBlank()) {
                    continue;
                }
                ordinal++;
                String typeName = resultString(rs, "TYPE_NAME", "type_name", "data_type");
                int columnSize = resultInt(rs, 0, "COLUMN_SIZE", "column_size");
                int decimalDigits = resultInt(rs, 0, "DECIMAL_DIGITS", "decimal_digits");
                boolean nullable = readNullable(rs);
                String defaultValue = TableMetadataSupport.blankToNull(
                        resultString(rs, "COLUMN_DEF", "column_def")
                );
                String remarks = TableMetadataSupport.blankToNull(
                        resultString(rs, "REMARKS", "remarks")
                );
                String autoIncRaw = resultString(rs, "IS_AUTOINCREMENT", "is_auto_increment");
                boolean autoIncrement = "YES".equalsIgnoreCase(autoIncRaw);
                columns.add(new TableColumnDetail(
                        ordinal,
                        columnName,
                        TableMetadataSupport.formatDataType(typeName, columnSize, decimalDigits),
                        nullable,
                        autoIncrement,
                        null,
                        defaultValue,
                        autoIncrement ? "auto_increment" : null,
                        remarks
                ));
            }
        }
        return columns;
    }

    private static boolean readNullable(ResultSet rs) throws SQLException {
        String isNullable = resultString(rs, "IS_NULLABLE", "is_nullable");
        if (isNullable != null && !isNullable.isBlank()) {
            return !"NO".equalsIgnoreCase(isNullable.trim());
        }
        int nullable = resultInt(rs, DatabaseMetaData.columnNullable, "NULLABLE", "nullable");
        return nullable != DatabaseMetaData.columnNoNulls;
    }

    private static String resultString(ResultSet rs, String... labels) throws SQLException {
        for (String label : labels) {
            try {
                String value = rs.getString(label);
                if (value != null) {
                    return value;
                }
            } catch (SQLException ex) {
                // HS2 uses lowercase JDBC metadata labels.
            }
        }
        return null;
    }

    private static int resultInt(ResultSet rs, int defaultValue, String... labels) throws SQLException {
        for (String label : labels) {
            try {
                return rs.getInt(label);
            } catch (SQLException ex) {
                // HS2 uses lowercase JDBC metadata labels.
            }
        }
        return defaultValue;
    }

    private static List<TableColumnDetail> loadColumnsViaDescribe(
            Connection connection,
            String database,
            String tableName
    ) throws SQLException {
        HiveTableScope scope = parseScope(database);
        List<String> targets = List.of(
                unqualifiedTableName(database, tableName),
                quoteQualifiedTable(database, tableName)
        );
        for (String target : targets) {
            if (target == null || target.isBlank()) {
                continue;
            }
            for (String prefix : List.of("DESCRIBE ", "DESC ")) {
                List<TableColumnDetail> columns = parseDescribe(connection, prefix + target);
                if (!columns.isEmpty()) {
                    return columns;
                }
            }
        }
        return loadColumnsViaDescribeInDatabase(connection, scope, tableName);
    }

    private static List<TableColumnDetail> loadColumnsViaDescribeInDatabase(
            Connection connection,
            HiveTableScope scope,
            String tableName
    ) throws SQLException {
        String database = scope.database();
        if (database == null || database.isBlank()) {
            return List.of();
        }
        String quotedDatabase = DbType.HIVE.quoteName(database.trim());
        String quotedTable = DbType.HIVE.quoteName(tableName);
        try (Statement statement = connection.createStatement()) {
            statement.execute("USE " + quotedDatabase);
            for (String prefix : List.of("DESCRIBE ", "DESC ")) {
                List<TableColumnDetail> columns = parseDescribe(connection, prefix + quotedTable);
                if (!columns.isEmpty()) {
                    return columns;
                }
            }
        } catch (SQLException ex) {
            return List.of();
        }
        return List.of();
    }

    private static List<TableColumnDetail> parseDescribe(Connection connection, String sql) throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            int ordinal = 0;
            while (rs.next()) {
                String columnName = firstNonBlank(rs.getString("col_name"), rs.getString(1));
                if (columnName == null || columnName.isBlank()) {
                    continue;
                }
                if (isDescribeHeaderRow(columnName)) {
                    continue;
                }
                if (columnName.startsWith("#") || "Partition Information".equalsIgnoreCase(columnName)) {
                    break;
                }
                String dataType = firstNonBlank(rs.getString("data_type"), rs.getString(2));
                String comment = firstNonBlank(rs.getString("comment"), rs.getString(3));
                ordinal++;
                columns.add(new TableColumnDetail(
                        ordinal,
                        columnName,
                        dataType != null ? dataType : "",
                        true,
                        false,
                        null,
                        null,
                        null,
                        TableMetadataSupport.blankToNull(comment)
                ));
            }
        } catch (SQLException ex) {
            return List.of();
        }
        return columns;
    }

    public static String[][] metadataProbes(HiveTableScope scope) {
        String catalog = scope.catalog();
        String database = scope.database();
        if (database != null && !database.isBlank()) {
            return new String[][]{
                    {null, database.trim()},
                    {database.trim(), null},
                    {catalog, database.trim()},
            };
        }
        if (catalog != null && !catalog.isBlank()) {
            return new String[][]{
                    {null, catalog.trim()},
                    {catalog.trim(), null},
                    {catalog.trim(), "%"},
            };
        }
        return new String[][]{{null, "%"}};
    }

    public static void applyScope(Connection connection, HiveTableScope scope) throws SQLException {
        try {
            if (isSyntheticCatalog(scope.catalog(), connection)) {
                if (scope.database() != null && !scope.database().isBlank()) {
                    connection.setSchema(scope.database().trim());
                } else if (scope.catalog() != null && !scope.catalog().isBlank()) {
                    connection.setSchema(scope.catalog().trim());
                }
                return;
            }
            if (scope.catalog() != null && !scope.catalog().isBlank()) {
                connection.setCatalog(scope.catalog().trim());
            }
            if (scope.database() != null && !scope.database().isBlank()) {
                connection.setSchema(scope.database().trim());
            }
        } catch (SQLException ex) {
            // HS2 builds vary; metadata/DESCRIBE fallbacks still run.
        }
    }

    static boolean isSyntheticCatalog(String catalog, Connection connection) throws SQLException {
        if (catalog == null || catalog.isBlank()) {
            return false;
        }
        if (hasRealCatalogs(connection)) {
            return false;
        }
        if (SYNTHETIC_CATALOG_FALLBACK.equalsIgnoreCase(catalog.trim())) {
            return true;
        }
        String current = connection.getCatalog();
        return current == null || current.isBlank();
    }

    public static String[] jdbcTableTypes() {
        return JDBC_TABLE_TYPES;
    }

    public static String[] jdbcViewTypes() {
        return JDBC_VIEW_TYPES;
    }

    private static boolean isDescribeHeaderRow(String columnName) {
        return "col_name".equalsIgnoreCase(columnName)
                || "# col_name".equalsIgnoreCase(columnName);
    }

    private static String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary.trim();
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback.trim();
        }
        return null;
    }
}
