package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.DbTypeFamily;
import org.apache.datawise.backend.ddl.render.DialectSqlSupport;

/**
 * Builds CREATE DATABASE / CREATE SCHEMA SQL and reports dialect support.
 */
public final class NamespaceDdlSupport {

    private NamespaceDdlSupport() {
    }

    public static boolean supportsCreateDatabase(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        String id = DbType.normalizeId(dbType);
        if (DbTypeFamily.isOracleFamily(id) || DbTypeFamily.isDmFamily(id) || DbTypeFamily.isDb2Family(id)) {
            return false;
        }
        if ("mongodb".equals(id) || "redis".equals(id) || "kafka".equals(id)
                || "yarn".equals(id) || "ssh".equals(id) || "elasticsearch".equals(id)
                || "kylin".equals(id) || "sqlite".equals(id) || "hsql".equals(id)) {
            return false;
        }
        // Catalog engines usually cannot create catalogs via simple SQL.
        if (DbTypeFamily.isCatalogSchemaFamily(id)) {
            return false;
        }
        return DbTypeFamily.isMysqlFamily(id)
                || DbTypeFamily.isOlapFamily(id)
                || DbTypeFamily.isPostgresqlFamily(id)
                || DbTypeFamily.isSqlServerFamily(id)
                || DbTypeFamily.isClickhouse(id)
                || "hive".equals(id);
    }

    public static boolean supportsCreateSchema(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        String id = DbType.normalizeId(dbType);
        if ("mongodb".equals(id) || "redis".equals(id) || "kafka".equals(id)
                || "yarn".equals(id) || "ssh".equals(id)) {
            return false;
        }
        return DbTypeFamily.isPostgresqlFamily(id)
                || DbTypeFamily.isSqlServerFamily(id)
                || DbTypeFamily.isCatalogSchemaFamily(id)
                || DbTypeFamily.isOracleFamily(id)
                || DbTypeFamily.isDmFamily(id)
                || DbTypeFamily.isDb2Family(id);
    }

    public static boolean supportsMysqlCharsetOptions(String dbType) {
        return DbTypeFamily.isMysqlFamily(dbType);
    }

    public static String requireValidName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        String trimmed = name.trim();
        if (trimmed.length() > 128) {
            throw new IllegalArgumentException("name is too long (max 128)");
        }
        for (int i = 0; i < trimmed.length(); i++) {
            char ch = trimmed.charAt(i);
            if (Character.isISOControl(ch)) {
                throw new IllegalArgumentException("name contains invalid control characters");
            }
        }
        return trimmed;
    }

    public static String buildCreateDatabaseSql(String dbType, String name, String charset, String collation) {
        String validName = requireValidName(name);
        if (!supportsCreateDatabase(dbType)) {
            throw new IllegalArgumentException("CREATE DATABASE is not supported for dbType=" + dbType);
        }
        String quoted = DialectSqlSupport.quote(dbType, validName);
        StringBuilder sql = new StringBuilder("CREATE DATABASE ").append(quoted);
        if (supportsMysqlCharsetOptions(dbType)) {
            if (charset != null && !charset.isBlank()) {
                sql.append(" CHARACTER SET '")
                        .append(DialectSqlSupport.escapeSingleQuote(charset.trim()))
                        .append('\'');
            }
            if (collation != null && !collation.isBlank()) {
                sql.append(" COLLATE '")
                        .append(DialectSqlSupport.escapeSingleQuote(collation.trim()))
                        .append('\'');
            }
        }
        return sql.toString();
    }

    public static boolean supportsDropDatabase(String dbType) {
        return supportsCreateDatabase(dbType);
    }

    public static String buildDropDatabaseSql(String dbType, String name) {
        String validName = requireValidName(name);
        if (!supportsDropDatabase(dbType)) {
            throw new IllegalArgumentException("DROP DATABASE is not supported for dbType=" + dbType);
        }
        return "DROP DATABASE " + DialectSqlSupport.quote(dbType, validName);
    }

    public static String buildCreateSchemaSql(String dbType, String name, String catalog) {
        String validName = requireValidName(name);
        if (!supportsCreateSchema(dbType)) {
            throw new IllegalArgumentException("CREATE SCHEMA is not supported for dbType=" + dbType);
        }
        String quotedName = DialectSqlSupport.quote(dbType, validName);
        if (DbTypeFamily.isCatalogSchemaFamily(dbType) && catalog != null && !catalog.isBlank()) {
            String quotedCatalog = DialectSqlSupport.quote(dbType, catalog.trim());
            return "CREATE SCHEMA " + quotedCatalog + "." + quotedName;
        }
        return "CREATE SCHEMA " + quotedName;
    }
}
