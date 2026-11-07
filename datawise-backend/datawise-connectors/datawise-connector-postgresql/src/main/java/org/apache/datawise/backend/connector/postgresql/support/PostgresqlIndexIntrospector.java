package org.apache.datawise.backend.connector.postgresql.support;

import org.apache.datawise.backend.metadata.ForeignKeyDefinition;
import org.apache.datawise.backend.metadata.IndexDefinition;
import org.apache.datawise.backend.metadata.PrimaryKeyDefinition;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Loads PostgreSQL primary keys, indexes, and foreign keys. */
public final class PostgresqlIndexIntrospector {

    public PrimaryKeyDefinition loadPrimaryKey(Connection connection, String schema, String tableName)
            throws SQLException {
        List<String> columns = new ArrayList<>();
        String constraintName = null;
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT tc.constraint_name, kcu.column_name, kcu.ordinal_position
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                 AND tc.table_name = kcu.table_name
                WHERE tc.table_schema = ?
                  AND tc.table_name = ?
                  AND tc.constraint_type = 'PRIMARY KEY'
                ORDER BY kcu.ordinal_position
                """)) {
            ps.setString(1, schema);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    if (constraintName == null) {
                        constraintName = rs.getString("constraint_name");
                    }
                    columns.add(rs.getString("column_name"));
                }
            }
        }
        if (columns.isEmpty()) {
            return null;
        }
        return new PrimaryKeyDefinition(constraintName, columns);
    }

    public List<IndexDefinition> loadIndexes(Connection connection, String schema, String tableName)
            throws SQLException {
        Map<String, IndexDefinitionBuilder> grouped = new LinkedHashMap<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = ? AND tablename = ?
                ORDER BY indexname
                """)) {
            ps.setString(1, schema);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString("indexname");
                    String indexDef = rs.getString("indexdef");
                    if (name == null || indexDef == null) {
                        continue;
                    }
                    if (name.endsWith("_pkey")) {
                        continue;
                    }
                    boolean unique = indexDef.toUpperCase(Locale.ROOT).contains(" UNIQUE ");
                    grouped.put(name, new IndexDefinitionBuilder(name, unique, extractIndexColumns(indexDef)));
                }
            }
        }
        return grouped.values().stream()
                .map(IndexDefinitionBuilder::build)
                .toList();
    }

    public List<ForeignKeyDefinition> loadForeignKeys(Connection connection, String schema, String tableName)
            throws SQLException {
        List<ForeignKeyDefinition> foreignKeys = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT
                  tc.constraint_name,
                  kcu.column_name,
                  ccu.table_name AS foreign_table_name,
                  ccu.column_name AS foreign_column_name,
                  rc.delete_rule,
                  rc.update_rule
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON ccu.constraint_name = tc.constraint_name
                 AND ccu.table_schema = tc.table_schema
                JOIN information_schema.referential_constraints rc
                  ON rc.constraint_name = tc.constraint_name
                 AND rc.constraint_schema = tc.table_schema
                WHERE tc.table_schema = ?
                  AND tc.table_name = ?
                  AND tc.constraint_type = 'FOREIGN KEY'
                ORDER BY tc.constraint_name, kcu.ordinal_position
                """)) {
            ps.setString(1, schema);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                Map<String, ForeignKeyBuilder> grouped = new LinkedHashMap<>();
                while (rs.next()) {
                    String name = rs.getString("constraint_name");
                    ForeignKeyBuilder builder = grouped.get(name);
                    if (builder == null) {
                        builder = new ForeignKeyBuilder(
                                name,
                                rs.getString("foreign_table_name"),
                                rs.getString("delete_rule"),
                                rs.getString("update_rule")
                        );
                        grouped.put(name, builder);
                    }
                    builder.columns.add(rs.getString("column_name"));
                    builder.referencedColumns.add(rs.getString("foreign_column_name"));
                }
                for (ForeignKeyBuilder builder : grouped.values()) {
                    foreignKeys.add(builder.build());
                }
            }
        }
        return foreignKeys;
    }

    private static List<String> extractIndexColumns(String indexDef) {
        int start = indexDef.indexOf('(');
        int end = indexDef.lastIndexOf(')');
        if (start < 0 || end <= start) {
            return List.of();
        }
        String body = indexDef.substring(start + 1, end);
        List<String> columns = new ArrayList<>();
        for (String part : body.split(",")) {
            String cleaned = part.trim().replace("\"", "");
            if (!cleaned.isBlank()) {
                columns.add(cleaned);
            }
        }
        return columns;
    }

    private static final class IndexDefinitionBuilder {
        private final String name;
        private final boolean unique;
        private final List<String> columnNames;

        private IndexDefinitionBuilder(String name, boolean unique, List<String> columnNames) {
            this.name = name;
            this.unique = unique;
            this.columnNames = columnNames;
        }

        private IndexDefinition build() {
            return new IndexDefinition(name, unique, columnNames, null);
        }
    }

    private static final class ForeignKeyBuilder {
        private final String name;
        private final String referencedTable;
        private final String onDelete;
        private final String onUpdate;
        private final List<String> columns = new ArrayList<>();
        private final List<String> referencedColumns = new ArrayList<>();

        private ForeignKeyBuilder(String name, String referencedTable, String onDelete, String onUpdate) {
            this.name = name;
            this.referencedTable = referencedTable;
            this.onDelete = onDelete;
            this.onUpdate = onUpdate;
        }

        private ForeignKeyDefinition build() {
            return new ForeignKeyDefinition(name, columns, referencedTable, referencedColumns, onDelete, onUpdate);
        }
    }
}
