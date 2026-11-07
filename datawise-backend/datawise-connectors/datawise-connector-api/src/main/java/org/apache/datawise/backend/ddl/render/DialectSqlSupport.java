package org.apache.datawise.backend.ddl.render;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.metadata.LogicalType;

/** DDL 渲染通用 SQL 片段工具。 */
public final class DialectSqlSupport {

    private DialectSqlSupport() {
    }

    public static String quoteBacktick(String ident) {
        return DbType.MYSQL.quoteName(ident);
    }

    public static String quoteDouble(String ident) {
        return DbType.POSTGRESQL.quoteName(ident);
    }

    public static String quoteBracket(String ident) {
        return DbType.SQLSERVER.quoteName(ident);
    }

    /** 按 dbType 引用标识符，规则与 {@link DbType#quoteIdentifier(String, String)} 一致。 */
    public static String quote(String dbTypeId, String ident) {
        return DbType.quoteIdentifier(dbTypeId, ident);
    }

    public static String escapeSingleQuote(String value) {
        return value.replace("'", "''");
    }

    public static String escapeDoubleQuote(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public static String renderDecimal(String keyword, LogicalType type) {
        if (type.precision() != null && type.scale() != null) {
            return keyword + "(" + type.precision() + "," + type.scale() + ")";
        }
        if (type.precision() != null) {
            return keyword + "(" + type.precision() + ")";
        }
        return keyword;
    }
}
