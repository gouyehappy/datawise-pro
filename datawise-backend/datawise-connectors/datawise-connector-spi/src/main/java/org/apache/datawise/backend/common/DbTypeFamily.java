package org.apache.datawise.backend.common;

import java.util.LinkedHashSet;
import java.util.Set;

/** DbType family groupings (MySQL, PostgreSQL, OLAP, etc.). */
public final class DbTypeFamily {

    private static final Set<String> MYSQL_FAMILY_IDS = Set.of(
            "mysql", "mariadb", "oceanbase", "tidb", "gbase8a");
    private static final Set<String> OLAP_FAMILY_IDS = Set.of("doris", "starrocks");
    private static final Set<String> MYSQL_PROTOCOL_IDS = union(MYSQL_FAMILY_IDS, OLAP_FAMILY_IDS);
    private static final Set<String> POSTGRESQL_FAMILY_IDS = Set.of(
            "postgresql", "kingbase", "greenplum", "opengauss", "highgo", "gaussdb");
    private static final Set<String> SQLSERVER_ALIASES = Set.of("sqlserver", "mssql");
    private static final Set<String> CATALOG_SCHEMA_FAMILY_IDS = Set.of("trino", "presto", "hive", "flink");
    private static final Set<String> HIVE_FAMILY_IDS = Set.of("hive");
    private static final Set<String> TRINO_FAMILY_IDS = Set.of("trino", "presto");
    private static final Set<String> ORACLE_FAMILY_IDS = Set.of("oracle");
    private static final Set<String> DB2_FAMILY_IDS = Set.of("db2");
    private static final Set<String> DM_FAMILY_IDS = Set.of("dm", "dameng");

    private DbTypeFamily() {
    }

    public static boolean isMysqlFamily(String dbType) {
        return MYSQL_FAMILY_IDS.contains(DbType.normalizeId(dbType));
    }

    public static boolean isOlapFamily(String dbType) {
        return OLAP_FAMILY_IDS.contains(DbType.normalizeId(dbType));
    }

    public static boolean isDoris(String dbType) {
        return DbType.DORIS.matches(dbType);
    }

    public static boolean isStarrocks(String dbType) {
        return DbType.STARROCKS.matches(dbType);
    }

    public static boolean isMysqlProtocol(String dbType) {
        return MYSQL_PROTOCOL_IDS.contains(DbType.normalizeId(dbType));
    }

    public static boolean isPostgresqlFamily(String dbType) {
        return POSTGRESQL_FAMILY_IDS.contains(DbType.normalizeId(dbType));
    }

    public static boolean isSqlServerFamily(String dbType) {
        return SQLSERVER_ALIASES.contains(DbType.normalizeId(dbType));
    }

    public static boolean isCatalogSchemaFamily(String dbType) {
        return CATALOG_SCHEMA_FAMILY_IDS.contains(DbType.normalizeId(dbType));
    }

    /** Explorer tree: catalog (database) → schema → tables (Trino/Hive/SQL Server). Aligns with {@link #usesCatalogSchemaHierarchy()} on dialects. */
    public static boolean usesCatalogSchemaInstanceKey(String dbType) {
        return isCatalogSchemaFamily(dbType) || isSqlServerFamily(dbType);
    }

    public static boolean isTrinoFamily(String dbType) {
        return TRINO_FAMILY_IDS.contains(DbType.normalizeId(dbType));
    }

    public static boolean isOracleFamily(String dbType) {
        return ORACLE_FAMILY_IDS.contains(DbType.normalizeId(dbType));
    }

    /** Oracle / DM / DB2：连接根节点直接展示 schema（owner），无 catalog 层。 */
    public static boolean isSchemaRootFamily(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        return ORACLE_FAMILY_IDS.contains(normalized)
                || DM_FAMILY_IDS.contains(normalized)
                || DB2_FAMILY_IDS.contains(normalized);
    }

    public static boolean isClickhouse(String dbType) {
        return DbType.CLICKHOUSE.matches(dbType);
    }

    public static boolean isHive(String dbType) {
        return isHiveFamily(dbType);
    }

    /** Hive / Impala SQL dialects share HiveServer2 JDBC semantics. */
    public static boolean isHiveFamily(String dbType) {
        return HIVE_FAMILY_IDS.contains(DbType.normalizeId(dbType))
                || DbType.HIVE.matches(dbType);
    }

    public static boolean isHiveFamily(DbType type) {
        return type != null && isHiveFamily(type.id());
    }

    public static boolean isDb2Family(String dbType) {
        return DB2_FAMILY_IDS.contains(DbType.normalizeId(dbType));
    }

    public static boolean isDmFamily(String dbType) {
        return DM_FAMILY_IDS.contains(DbType.normalizeId(dbType));
    }

    public static Set<String> mysqlFamilyIds() {
        return MYSQL_FAMILY_IDS;
    }

    public static Set<String> olapFamilyIds() {
        return OLAP_FAMILY_IDS;
    }

    public static Set<String> mysqlProtocolIds() {
        return MYSQL_PROTOCOL_IDS;
    }

    public static Set<String> postgresqlFamilyIds() {
        return POSTGRESQL_FAMILY_IDS;
    }

    public static boolean isMysqlFamily(DbType type) {
        return MYSQL_FAMILY_IDS.contains(type.id());
    }

    public static boolean isOlapFamily(DbType type) {
        return OLAP_FAMILY_IDS.contains(type.id());
    }

    public static boolean isMysqlProtocol(DbType type) {
        return MYSQL_PROTOCOL_IDS.contains(type.id());
    }

    public static boolean isPostgresqlFamily(DbType type) {
        return POSTGRESQL_FAMILY_IDS.contains(type.id());
    }

    public static boolean isSqlServerFamily(DbType type) {
        return SQLSERVER_ALIASES.contains(type.id());
    }

    public static boolean isCatalogSchemaFamily(DbType type) {
        return CATALOG_SCHEMA_FAMILY_IDS.contains(type.id());
    }

    public static boolean usesCatalogSchemaInstanceKey(DbType type) {
        return type != null && usesCatalogSchemaInstanceKey(type.id());
    }

    public static boolean isTrinoFamily(DbType type) {
        return TRINO_FAMILY_IDS.contains(type.id());
    }

    public static boolean isDb2Family(DbType type) {
        return DB2_FAMILY_IDS.contains(type.id());
    }

    public static boolean isDmFamily(DbType type) {
        return DM_FAMILY_IDS.contains(type.id());
    }

    @SafeVarargs
    private static Set<String> union(Set<String>... sets) {
        LinkedHashSet<String> merged = new LinkedHashSet<>();
        for (Set<String> set : sets) {
            merged.addAll(set);
        }
        return Set.copyOf(merged);
    }
}
