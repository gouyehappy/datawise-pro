package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.DbTypeFamily;
import org.apache.datawise.backend.domain.DataTypeOptionsResult;
import org.apache.datawise.backend.domain.EngineOptionsResult;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * MetaForge B1：方言引擎 / 数据类型选项（纯逻辑，便于单测）。
 * MySQL 系引擎来自 {@code SHOW ENGINES}；数据类型以静态目录按 dbType 族路由。
 */
public final class DialectOptionsSupport {

    private DialectOptionsSupport() {
    }

    public static boolean supportsLiveEngines(String dbType) {
        return DbTypeFamily.isMysqlFamily(dbType) || DbTypeFamily.isMysqlProtocol(dbType);
    }

    public static boolean supportsDataTypeCatalog(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        String id = DbType.normalizeId(dbType);
        return DbTypeFamily.isMysqlFamily(id)
                || DbTypeFamily.isMysqlProtocol(id)
                || DbTypeFamily.isPostgresqlFamily(id)
                || DbTypeFamily.isSqlServerFamily(id)
                || DbTypeFamily.isClickhouse(id)
                || DbTypeFamily.isDmFamily(id)
                || "oracle".equals(id)
                || DbType.isSqlite(id);
    }

    public static List<EngineOptionsResult.EngineOption> parseMysqlEngines(ResultSet rs) throws SQLException {
        List<EngineOptionsResult.EngineOption> rows = new ArrayList<>();
        while (rs.next()) {
            String name = blankToEmpty(column(rs, "Engine", 1));
            if (name.isBlank()) {
                continue;
            }
            String support = blankToEmpty(column(rs, "Support", 2));
            String comment = blankToEmpty(column(rs, "Comment", 3));
            rows.add(new EngineOptionsResult.EngineOption(
                    name,
                    support,
                    comment,
                    yes(column(rs, "Transactions", 4)),
                    yes(column(rs, "XA", 5)),
                    yes(column(rs, "Savepoints", 6))
            ));
        }
        return rows;
    }

    public static List<DataTypeOptionsResult.DataTypeOption> listDataTypes(String dbType) {
        if (!supportsDataTypeCatalog(dbType)) {
            return List.of();
        }
        String id = DbType.normalizeId(dbType);
        if (DbTypeFamily.isPostgresqlFamily(id)) {
            return postgresqlTypes();
        }
        if (DbTypeFamily.isSqlServerFamily(id)) {
            return sqlServerTypes();
        }
        if (DbTypeFamily.isClickhouse(id)) {
            return clickhouseTypes();
        }
        if (DbTypeFamily.isDmFamily(id) || "oracle".equals(id)) {
            return oracleFamilyTypes();
        }
        if (DbType.isSqlite(id)) {
            return sqliteTypes();
        }
        return mysqlFamilyTypes();
    }

    private static List<DataTypeOptionsResult.DataTypeOption> mysqlFamilyTypes() {
        return List.of(
                type("INT", "numeric", "Signed 32-bit integer"),
                type("BIGINT", "numeric", "Signed 64-bit integer"),
                type("DECIMAL", "numeric", "Exact numeric"),
                type("FLOAT", "numeric", "Single-precision float"),
                type("DOUBLE", "numeric", "Double-precision float"),
                type("BOOLEAN", "numeric", "Synonym for TINYINT(1)"),
                type("CHAR", "string", "Fixed-length string"),
                type("VARCHAR", "string", "Variable-length string"),
                type("TEXT", "string", "Long text"),
                type("DATE", "temporal", "Calendar date"),
                type("DATETIME", "temporal", "Date and time"),
                type("TIMESTAMP", "temporal", "UTC timestamp"),
                type("TIME", "temporal", "Time of day"),
                type("BLOB", "binary", "Binary large object"),
                type("JSON", "json", "JSON document")
        );
    }

    private static List<DataTypeOptionsResult.DataTypeOption> postgresqlTypes() {
        return List.of(
                type("integer", "numeric", "Signed 32-bit integer"),
                type("bigint", "numeric", "Signed 64-bit integer"),
                type("numeric", "numeric", "Exact numeric"),
                type("real", "numeric", "Single-precision float"),
                type("double precision", "numeric", "Double-precision float"),
                type("boolean", "numeric", "Boolean"),
                type("character varying", "string", "Variable-length string"),
                type("text", "string", "Unlimited text"),
                type("date", "temporal", "Calendar date"),
                type("timestamp without time zone", "temporal", "Timestamp"),
                type("timestamp with time zone", "temporal", "Timestamp with time zone"),
                type("bytea", "binary", "Binary data"),
                type("jsonb", "json", "Binary JSON"),
                type("uuid", "other", "UUID")
        );
    }

    private static List<DataTypeOptionsResult.DataTypeOption> sqlServerTypes() {
        return List.of(
                type("int", "numeric", "Signed 32-bit integer"),
                type("bigint", "numeric", "Signed 64-bit integer"),
                type("decimal", "numeric", "Exact numeric"),
                type("float", "numeric", "Floating point"),
                type("bit", "numeric", "Boolean bit"),
                type("varchar", "string", "Variable-length string"),
                type("nvarchar", "string", "Unicode variable-length string"),
                type("text", "string", "Long text"),
                type("date", "temporal", "Calendar date"),
                type("datetime2", "temporal", "Date and time"),
                type("varbinary", "binary", "Variable-length binary"),
                type("uniqueidentifier", "other", "GUID")
        );
    }

    private static List<DataTypeOptionsResult.DataTypeOption> clickhouseTypes() {
        return List.of(
                type("Int32", "numeric", "Signed 32-bit integer"),
                type("Int64", "numeric", "Signed 64-bit integer"),
                type("Float64", "numeric", "Double-precision float"),
                type("Decimal", "numeric", "Exact numeric"),
                type("String", "string", "String"),
                type("Date", "temporal", "Calendar date"),
                type("DateTime", "temporal", "Date and time"),
                type("UUID", "other", "UUID")
        );
    }

    private static List<DataTypeOptionsResult.DataTypeOption> oracleFamilyTypes() {
        return List.of(
                type("NUMBER", "numeric", "Exact numeric"),
                type("INTEGER", "numeric", "Integer"),
                type("FLOAT", "numeric", "Floating point"),
                type("VARCHAR2", "string", "Variable-length string"),
                type("CHAR", "string", "Fixed-length string"),
                type("CLOB", "string", "Character large object"),
                type("DATE", "temporal", "Date and time"),
                type("TIMESTAMP", "temporal", "Timestamp"),
                type("BLOB", "binary", "Binary large object"),
                type("RAW", "binary", "Raw binary")
        );
    }

    private static List<DataTypeOptionsResult.DataTypeOption> sqliteTypes() {
        return List.of(
                type("INTEGER", "numeric", "Integer affinity"),
                type("REAL", "numeric", "Floating affinity"),
                type("TEXT", "string", "Text affinity"),
                type("BLOB", "binary", "Binary affinity"),
                type("NUMERIC", "numeric", "Numeric affinity")
        );
    }

    private static DataTypeOptionsResult.DataTypeOption type(String name, String category, String description) {
        return new DataTypeOptionsResult.DataTypeOption(name, category, description);
    }

    private static String column(ResultSet rs, String label, int index) {
        try {
            String byLabel = rs.getString(label);
            if (byLabel != null) {
                return byLabel;
            }
        } catch (SQLException ignored) {
            // fall through to ordinal
        }
        try {
            return rs.getString(index);
        } catch (SQLException ex) {
            return "";
        }
    }

    private static String blankToEmpty(String value) {
        return value != null ? value.trim() : "";
    }

    private static boolean yes(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return "yes".equals(normalized) || "true".equals(normalized) || "1".equals(normalized);
    }
}
