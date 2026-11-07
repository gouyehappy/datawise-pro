package org.apache.datawise.backend.connector.postgresql.support;

import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.LogicalType;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Loads PostgreSQL column metadata and table comments. */
public final class PostgresqlColumnIntrospector {

    public List<ColumnDefinition> loadColumns(Connection connection, String schema, String tableName)
            throws SQLException {
        List<ColumnDefinition> columns = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT
                  c.ordinal_position,
                  c.column_name,
                  c.udt_name,
                  c.character_maximum_length,
                  c.numeric_precision,
                  c.numeric_scale,
                  c.is_nullable,
                  c.column_default,
                  c.is_identity,
                  pgd.description AS column_comment
                FROM information_schema.columns c
                LEFT JOIN pg_catalog.pg_statio_all_tables st
                  ON st.schemaname = c.table_schema AND st.relname = c.table_name
                LEFT JOIN pg_catalog.pg_description pgd
                  ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
                WHERE c.table_schema = ? AND c.table_name = ?
                ORDER BY c.ordinal_position
                """)) {
            ps.setString(1, schema);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String udtName = rs.getString("udt_name");
                    Integer charLen = (Integer) rs.getObject("character_maximum_length");
                    Integer precision = (Integer) rs.getObject("numeric_precision");
                    Integer scale = (Integer) rs.getObject("numeric_scale");
                    boolean nullable = "YES".equalsIgnoreCase(rs.getString("is_nullable"));
                    String defaultValue = blankToNull(rs.getString("column_default"));
                    boolean identity = "YES".equalsIgnoreCase(rs.getString("is_identity"))
                            || (defaultValue != null && defaultValue.startsWith("nextval("));
                    columns.add(new ColumnDefinition(
                            rs.getString("column_name"),
                            PostgresqlLogicalTypeParser.fromUdt(udtName, charLen, precision, scale),
                            nullable,
                            defaultValue,
                            identity,
                            blankToNull(rs.getString("column_comment")),
                            rs.getInt("ordinal_position")
                    ));
                }
            }
        }
        return columns;
    }

    public String loadTableComment(Connection connection, String schema, String tableName) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT obj_description(c.oid) AS comment
                FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = ? AND c.relname = ?
                """)) {
            ps.setString(1, schema);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return blankToNull(rs.getString("comment"));
                }
            }
        }
        return null;
    }

    public static String renderDataType(LogicalType type) {
        return new PostgresqlDdlRenderer().renderPhysicalType(type);
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }
}
