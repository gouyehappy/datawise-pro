package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.DbTypeFamily;

/**
 * ??????????? {@link DbTypeFamily}???????? dbType ??????
 */
public final class DbTypeFamilies {

    private DbTypeFamilies() {
    }

    public static String normalize(String dbType) {
        return DbType.normalizeId(dbType);
    }

    public static boolean isPostgresqlFamily(String dbType) {
        return DbType.isPostgresqlFamily(dbType);
    }

    public static boolean isMysqlFamily(String dbType) {
        return DbType.isMysqlFamily(dbType);
    }

    public static boolean isOlapFamily(String dbType) {
        return DbType.isOlapFamily(dbType);
    }

    /** MySQL ?? JDBC?? Doris / StarRocks?? */
    public static boolean isMysqlProtocol(String dbType) {
        return DbType.isMysqlProtocol(dbType);
    }

    public static boolean isSqlServerFamily(String dbType) {
        return DbType.isSqlServerFamily(dbType);
    }

    public static boolean isCatalogSchemaFamily(String dbType) {
        return DbType.isCatalogSchemaFamily(dbType);
    }

    public static boolean usesCatalogSchemaInstanceKey(String dbType) {
        return DbType.usesCatalogSchemaInstanceKey(dbType);
    }

    public static boolean isTrinoFamily(String dbType) {
        return DbTypeFamily.isTrinoFamily(dbType);
    }

    public static boolean isOracleFamily(String dbType) {
        return DbTypeFamily.isOracleFamily(dbType);
    }

    public static boolean isDb2Family(String dbType) {
        return DbTypeFamily.isDb2Family(dbType);
    }

    public static boolean isDmFamily(String dbType) {
        return DbTypeFamily.isDmFamily(dbType);
    }

    public static boolean isClickhouse(String dbType) {
        return DbTypeFamily.isClickhouse(dbType);
    }

    public static boolean isHive(String dbType) {
        return DbTypeFamily.isHive(dbType);
    }
}
