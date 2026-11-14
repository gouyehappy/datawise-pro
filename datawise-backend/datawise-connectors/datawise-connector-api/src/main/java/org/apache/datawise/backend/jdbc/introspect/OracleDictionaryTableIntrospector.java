package org.apache.datawise.backend.jdbc.introspect;

import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TableForeignKeyDetail;
import org.apache.datawise.backend.domain.TableIndexDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Clob;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Shared Oracle-compatible data-dictionary introspection
 * ({@code ALL_TAB_*} / {@code ALL_INDEXES} / {@code ALL_CONSTRAINTS} / {@code DBMS_METADATA}).
 * Used by Oracle, DB2, and Dameng — avoids JDBC {@code DatabaseMetaData} index/FK calls that
 * can fail on Oracle spatial / MDSYS tables.
 */
public abstract class OracleDictionaryTableIntrospector implements TableMetadataIntrospection {

    private static final Logger log = LoggerFactory.getLogger(OracleDictionaryTableIntrospector.class);

    private final String ownerRequiredMessage;

    protected OracleDictionaryTableIntrospector(String ownerRequiredMessage) {
        this.ownerRequiredMessage = Objects.requireNonNull(ownerRequiredMessage, "ownerRequiredMessage");
    }

    /**
     * Hook for dialect-specific relation guards (e.g. Oracle internal / recycle-bin tables).
     */
    protected void assertRelationAllowed(String schemaOwner, String objectName) {
        // default: all dictionary relations allowed
    }

    @Override
    public TablePropertiesResult loadProperties(
                                                Connection connection,
                                                ConnectionEntity entity,
                                                String database,
                                                String tableName) throws SQLException {
        return loadRelationProperties(connection, database, tableName, false);
    }

    @Override
    public TablePropertiesResult loadViewProperties(
                                                    Connection connection,
                                                    ConnectionEntity entity,
                                                    String database,
                                                    String viewName) throws SQLException {
        return loadRelationProperties(connection, database, viewName, true);
    }

    @Override
    public TableDdlResult loadDdl(
                                  Connection connection,
                                  ConnectionEntity entity,
                                  String database,
                                  String tableName) throws SQLException {
        return new TableDdlResult(loadMetadataDdl(connection, owner(database), tableName, "TABLE"));
    }

    @Override
    public TableDdlResult loadViewDdl(
                                      Connection connection,
                                      ConnectionEntity entity,
                                      String database,
                                      String viewName) throws SQLException {
        return new TableDdlResult(loadMetadataDdl(connection, owner(database), viewName, "VIEW"));
    }

    @Override
    public TableDdlResult loadSequenceDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String sequenceName
    ) throws SQLException {
        return new TableDdlResult(loadMetadataDdl(connection, owner(database), sequenceName, "SEQUENCE"));
    }

    private TablePropertiesResult loadRelationProperties(
                                                         Connection connection,
                                                         String database,
                                                         String relationName,
                                                         boolean view) throws SQLException {
        String schemaOwner = owner(database);
        String objectName = dictionaryName(relationName);
        assertRelationAllowed(schemaOwner, objectName);
        String comment = loadObjectComment(connection, schemaOwner, objectName);
        List<TableColumnDetail> columns = loadColumns(connection, schemaOwner, objectName);
        List<TableForeignKeyDetail> foreignKeys = view
                ? List.of()
                : loadForeignKeys(connection, schemaOwner, objectName);
        List<TableIndexDetail> indexes = view
                ? List.of()
                : loadIndexes(connection, schemaOwner, objectName);
        return new TablePropertiesResult(
                relationName,
                comment,
                null,
                null,
                null,
                null,
                columns,
                foreignKeys,
                indexes);
    }

    private List<TableIndexDetail> loadIndexes(Connection connection, String schemaOwner, String objectName) {
        Map<String, IndexBuilder> grouped = new LinkedHashMap<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT i.index_name,
                       i.uniqueness,
                       ic.column_name,
                       ic.column_position
                FROM all_indexes i
                JOIN all_ind_columns ic
                  ON ic.index_owner = i.owner
                 AND ic.index_name = i.index_name
                WHERE i.table_owner = ?
                  AND i.table_name = ?
                  AND i.index_type NOT IN ('LOB', 'IOT - TOP')
                ORDER BY i.index_name, ic.column_position
                """)) {
            ps.setString(1, schemaOwner);
            ps.setString(2, objectName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString("index_name");
                    if (name == null || name.isBlank()) {
                        continue;
                    }
                    IndexBuilder builder = grouped.get(name);
                    if (builder == null) {
                        builder = new IndexBuilder(name, "UNIQUE".equalsIgnoreCase(rs.getString("uniqueness")));
                        grouped.put(name, builder);
                    }
                    String column = rs.getString("column_name");
                    if (column != null && !column.isBlank()) {
                        builder.columns.add(column);
                    }
                }
            }
        } catch (SQLException ex) {
            log.warn("Dictionary index lookup failed for {}.{}: {}", schemaOwner, objectName, ex.getMessage());
            return List.of();
        }
        List<TableIndexDetail> indexes = new ArrayList<>(grouped.size());
        for (IndexBuilder builder : grouped.values()) {
            indexes.add(builder.build());
        }
        return indexes;
    }

    private List<TableForeignKeyDetail> loadForeignKeys(
                                                        Connection connection,
                                                        String schemaOwner,
                                                        String objectName) {
        Map<String, ForeignKeyBuilder> grouped = new LinkedHashMap<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT c.constraint_name,
                       cc.column_name,
                       r.owner AS ref_owner,
                       r.table_name AS ref_table,
                       rcc.column_name AS ref_column,
                       cc.position
                FROM all_constraints c
                JOIN all_cons_columns cc
                  ON cc.owner = c.owner
                 AND cc.constraint_name = c.constraint_name
                JOIN all_constraints r
                  ON r.owner = c.r_owner
                 AND r.constraint_name = c.r_constraint_name
                JOIN all_cons_columns rcc
                  ON rcc.owner = r.owner
                 AND rcc.constraint_name = r.constraint_name
                 AND rcc.position = cc.position
                WHERE c.owner = ?
                  AND c.table_name = ?
                  AND c.constraint_type = 'R'
                ORDER BY c.constraint_name, cc.position
                """)) {
            ps.setString(1, schemaOwner);
            ps.setString(2, objectName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString("constraint_name");
                    if (name == null || name.isBlank()) {
                        continue;
                    }
                    ForeignKeyBuilder builder = grouped.get(name);
                    if (builder == null) {
                        String refOwner = rs.getString("ref_owner");
                        String refTable = rs.getString("ref_table");
                        String qualified = refOwner != null && !refOwner.isBlank()
                                ? refOwner + "." + refTable
                                : refTable;
                        builder = new ForeignKeyBuilder(name, qualified);
                        grouped.put(name, builder);
                    }
                    String column = rs.getString("column_name");
                    String refColumn = rs.getString("ref_column");
                    if (column != null && !column.isBlank()) {
                        builder.columns.add(column);
                    }
                    if (refColumn != null && !refColumn.isBlank()) {
                        builder.refColumns.add(refColumn);
                    }
                }
            }
        } catch (SQLException ex) {
            log.warn("Dictionary foreign-key lookup failed for {}.{}: {}",
                    schemaOwner, objectName, ex.getMessage());
            return List.of();
        }
        List<TableForeignKeyDetail> foreignKeys = new ArrayList<>(grouped.size());
        for (ForeignKeyBuilder builder : grouped.values()) {
            foreignKeys.add(builder.build());
        }
        return foreignKeys;
    }

    private List<TableColumnDetail> loadColumns(Connection connection, String schemaOwner, String objectName) throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT c.column_id,
                       c.column_name,
                       c.data_type,
                       c.data_length,
                       c.data_precision,
                       c.data_scale,
                       c.nullable,
                       c.data_default,
                       cc.comments
                FROM all_tab_columns c
                LEFT JOIN all_col_comments cc
                    ON cc.owner = c.owner AND cc.table_name = c.table_name AND cc.column_name = c.column_name
                WHERE c.owner = ? AND c.table_name = ?
                ORDER BY c.column_id
                """)) {
            ps.setString(1, schemaOwner);
            ps.setString(2, objectName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    columns.add(new TableColumnDetail(
                            rs.getInt("column_id"),
                            rs.getString("column_name"),
                            formatDataType(
                                    rs.getString("data_type"),
                                    rs.getObject("data_length"),
                                    rs.getObject("data_precision"),
                                    rs.getObject("data_scale")),
                            "Y".equalsIgnoreCase(rs.getString("nullable")),
                            false,
                            null,
                            TableMetadataSupport.blankToNull(rs.getString("data_default")),
                            null,
                            TableMetadataSupport.blankToNull(rs.getString("comments"))));
                }
            }
        }
        return columns;
    }

    private String loadObjectComment(Connection connection, String schemaOwner, String objectName) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT comments
                FROM all_tab_comments
                WHERE owner = ? AND table_name = ?
                """)) {
            ps.setString(1, schemaOwner);
            ps.setString(2, objectName);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return TableMetadataSupport.blankToNull(rs.getString("comments"));
                }
            }
        }
        return null;
    }

    private String loadMetadataDdl(
                                   Connection connection,
                                   String schemaOwner,
                                   String objectName,
                                   String objectType) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT DBMS_METADATA.GET_DDL(?, ?, ?) AS ddl
                FROM dual
                """)) {
            ps.setString(1, objectType);
            ps.setString(2, objectName);
            ps.setString(3, schemaOwner);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalArgumentException(objectType + " not found: " + schemaOwner + "." + objectName);
                }
                String ddl = readClob(rs, "ddl");
                if (ddl == null || ddl.isBlank()) {
                    throw new IllegalArgumentException("DDL is not available for: " + schemaOwner + "." + objectName);
                }
                return ddl.trim();
            }
        }
    }

    private String owner(String database) {
        if (database == null || database.isBlank()) {
            throw new IllegalArgumentException(ownerRequiredMessage);
        }
        return database.trim().toUpperCase(Locale.ROOT);
    }

    private static String dictionaryName(String relationName) {
        return relationName == null ? "" : relationName.trim().toUpperCase(Locale.ROOT);
    }

    private static String readClob(ResultSet rs, String column) throws SQLException {
        Object value = rs.getObject(column);
        if (value == null) {
            return null;
        }
        if (value instanceof Clob clob) {
            long length = clob.length();
            if (length <= 0) {
                return "";
            }
            return clob.getSubString(1, (int) Math.min(length, Integer.MAX_VALUE));
        }
        return value.toString();
    }

    private static String formatDataType(
                                         String dataType,
                                         Object dataLength,
                                         Object precision,
                                         Object scale) {
        if (dataType == null || dataType.isBlank()) {
            return "";
        }
        String normalized = dataType.toUpperCase(Locale.ROOT);
        if (normalized.contains("CHAR") && dataLength instanceof Number length && length.intValue() > 0) {
            return normalized + "(" + length.intValue() + ")";
        }
        if ((normalized.contains("NUMBER") || normalized.contains("DECIMAL"))
                && precision instanceof Number prec
                && prec.intValue() > 0) {
            int scaleValue = scale instanceof Number scaleNumber ? scaleNumber.intValue() : 0;
            return normalized + "(" + prec.intValue() + "," + scaleValue + ")";
        }
        return normalized;
    }

    private static final class IndexBuilder {

        private final String name;
        private final boolean unique;
        private final List<String> columns = new ArrayList<>();

        private IndexBuilder(String name, boolean unique) {
            this.name = name;
            this.unique = unique;
        }

        private TableIndexDetail build() {
            return new TableIndexDetail(name, unique, String.join(", ", columns));
        }
    }

    private static final class ForeignKeyBuilder {

        private final String name;
        private final String referenceTable;
        private final List<String> columns = new ArrayList<>();
        private final List<String> refColumns = new ArrayList<>();

        private ForeignKeyBuilder(String name, String referenceTable) {
            this.name = name;
            this.referenceTable = referenceTable;
        }

        private TableForeignKeyDetail build() {
            return new TableForeignKeyDetail(
                    name,
                    String.join(", ", columns),
                    referenceTable,
                    String.join(", ", refColumns));
        }
    }
}
