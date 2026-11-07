package org.apache.datawise.backend.common;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;

import org.apache.datawise.backend.schema.CatalogSchemaScope;

/**
 * 数据库产品类型。{@link #id()} 为连接配置/API 使用的 canonical 小写标识（如 {@code mysql}）。
 */
public enum DbType {

    GENERIC,
    MYSQL,
    MARIADB,
    ORACLE,
    SQLSERVER,
    POSTGRESQL,
    DB2,
    DM,
    KINGBASE,
    OSCAR,
    GBASE8A,
    HIGHGO,
    SYBASE,
    HIVE,
    KUDU,
    SQLITE3,
    OPENGAUSS,
    CLICKHOUSE,
    MONGODB,
    ELASTICSEARCH,
    KYLIN,
    STARROCKS,
    GREENPLUM,
    DORIS,
    OCEANBASE,
    TDENGINE,
    TRINO,
    PRESTO,
    HSQL,
    H2,
    CACHEDB,
    PHOENIX,
    KAFKA,
    TIDB,
    REDIS,
    FLINK,
    YARN,
    JENKINS,
    SSH,
    KUBERNETES,
    NACOS,
    POLARIS,
    GAUSSDB,
    /** Community plugin connection ({@code .dwp} connection-provider). */
    PLUGIN,
    OTHER,
    ;

    private static final Map<DbType, DbTypeProfile> PROFILES = DbTypeProfiles.load();

    private DbTypeProfile profile() {
        return PROFILES.get(this);
    }

    /** canonical 小写 id，与连接配置 / API 一致。 */
    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }

    public String getQuote() {
        return profile().quote();
    }

    public String getDisplayName() {
        return profile().displayName();
    }

    public String getDriver() {
        return profile().driver();
    }

    public int getPort() {
        return profile().port();
    }

    public String getSql() {
        return profile().sql();
    }

    public String getUrlPrefix() {
        return urlTemplates().getUrlPrefix();
    }

    public String[] getUrl() {
        return urlTemplates().getUrl();
    }

    public String getSample() {
        return urlTemplates().getSample();
    }

    public DbTypeUrlTemplates urlTemplates() {
        DbTypeProfile profile = profile();
        return new DbTypeUrlTemplates(profile.urlPrefix(), profile.url(), profile.sample());
    }

    public FieldIdeEnum getFieldIde() {
        return profile().fieldIde();
    }

    /** Whether this type appears in the datasource catalog picker. */
    public boolean isCatalogListed() {
        return profile().catalog() != null;
    }

    public Optional<DbTypeCatalogEntry> catalogEntry() {
        return Optional.ofNullable(profile().catalog());
    }

    /** All catalog-listed types in enum declaration order. */
    public static List<DbType> catalogListed() {
        return Arrays.stream(values()).filter(DbType::isCatalogListed).toList();
    }

    public static String normalizeId(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return MYSQL.id();
        }
        return dbType.trim().toLowerCase(Locale.ROOT);
    }

    /** Whether {@code dbType} resolves to this constant (canonical id, display name, or alias). */
    public boolean matches(String dbType) {
        return find(dbType).filter(type -> type == this).isPresent();
    }

    public static DbType parse(String value) {
        return find(value).orElse(value == null || value.isBlank() ? MYSQL : OTHER);
    }

    public static DbType parseStrict(String value) {
        return find(value).orElseThrow(() -> new IllegalArgumentException("cannot find db type: " + value));
    }

    public static Optional<DbType> find(String value) {
        if (value == null || value.isBlank()) {
            return Optional.of(MYSQL);
        }
        String trimmed = value.trim();
        String normalized = trimmed.toLowerCase(Locale.ROOT);
        for (DbType type : values()) {
            if (type.id().equals(normalized) || type.getDisplayName().equalsIgnoreCase(trimmed)) {
                return Optional.of(type);
            }
        }
        return DbTypeAliases.resolve(normalized);
    }

    public static boolean exists(String value) {
        return find(value).filter(type -> type != OTHER && type != GENERIC).isPresent();
    }

    /** @deprecated 使用 {@link #parseStrict(String)} 或 {@link #find(String)} */
    @Deprecated
    public static DbType of(String name) {
        return parseStrict(name);
    }

    public static DbType ofName(String name) {
        return Arrays.stream(values())
                .filter(e -> e.name().equalsIgnoreCase(name))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("no such db type: " + name));
    }

    public static boolean isMysqlFamily(String dbType) {
        return DbTypeFamily.isMysqlFamily(dbType);
    }

    public static boolean isOlapFamily(String dbType) {
        return DbTypeFamily.isOlapFamily(dbType);
    }

    /** MySQL 协议 JDBC（含 OLAP：Doris / StarRocks）。 */
    public static boolean isMysqlProtocol(String dbType) {
        return DbTypeFamily.isMysqlProtocol(dbType);
    }

    public static boolean isPostgresqlFamily(String dbType) {
        return DbTypeFamily.isPostgresqlFamily(dbType);
    }

    public static boolean isSqlServerFamily(String dbType) {
        return DbTypeFamily.isSqlServerFamily(dbType);
    }

    public static boolean isCatalogSchemaFamily(String dbType) {
        return DbTypeFamily.isCatalogSchemaFamily(dbType);
    }

    public static boolean usesCatalogSchemaInstanceKey(String dbType) {
        return DbTypeFamily.usesCatalogSchemaInstanceKey(dbType);
    }

    public static boolean isDb2Family(String dbType) {
        return DbTypeFamily.isDb2Family(dbType);
    }

    public static boolean isDmFamily(String dbType) {
        return DbTypeFamily.isDmFamily(dbType);
    }

    public static boolean isSchemaRootFamily(String dbType) {
        return DbTypeFamily.isSchemaRootFamily(dbType);
    }

    public static Set<String> mysqlFamilyIds() {
        return DbTypeFamily.mysqlFamilyIds();
    }

    public static Set<String> olapFamilyIds() {
        return DbTypeFamily.olapFamilyIds();
    }

    public static Set<String> mysqlProtocolIds() {
        return DbTypeFamily.mysqlProtocolIds();
    }

    public static Set<String> postgresqlFamilyIds() {
        return DbTypeFamily.postgresqlFamilyIds();
    }

    public String quoteName(String name) {
        return IdentifierQuoting.quote(name, getQuote(), getFieldIde());
    }

    public String quoteSchemaTableName(String schema, String table) {
        return quoteName(schema) + "." + quoteName(table);
    }

    /** 按 dbType 引用单个标识符（与 {@link #quoteName(String)} 规则一致）。 */
    public static String quoteIdentifier(String dbTypeId, String name) {
        if (name == null || name.isBlank() || "*".equals(name)) {
            return name;
        }
        return find(normalizeId(dbTypeId)).orElse(MYSQL).quoteName(name);
    }

    /**
     * 按 dbType 拼装限定表名：MySQL {@code db.table}、SQL Server {@code [schema].[table]}、
     * Trino {@code catalog.schema.table} 等。
     */
    public static String quoteQualifiedTable(String dbTypeId, String database, String tableName) {
        String normalized = normalizeId(dbTypeId);
        String table = quoteIdentifier(normalized, tableName);
        if (database == null || database.isBlank()) {
            return table;
        }
        if (isCatalogSchemaFamily(normalized)) {
            CatalogSchemaScope scope = CatalogSchemaScope.parse(database);
            if (scope.hasSchema()) {
                return quoteIdentifier(normalized, scope.catalog())
                        + "."
                        + quoteIdentifier(normalized, scope.schema())
                        + "."
                        + table;
            }
            if (scope.catalog() != null && !scope.catalog().isBlank()) {
                return quoteIdentifier(normalized, scope.catalog()) + "." + table;
            }
            return table;
        }
        if (isSqlServerFamily(normalized)) {
            CatalogSchemaScope scope = CatalogSchemaScope.parse(database);
            String schema = scope.hasSchema() ? scope.schema() : "dbo";
            if (scope.catalog() != null && !scope.catalog().isBlank()) {
                return quoteIdentifier(normalized, scope.catalog())
                        + "."
                        + quoteIdentifier(normalized, schema)
                        + "."
                        + table;
            }
            return quoteIdentifier(normalized, schema) + "." + table;
        }
        return quoteIdentifier(normalized, database) + "." + table;
    }

    public String getFieldIde(String identifier, FieldIdeEnum fieldIde) {
        return IdentifierQuoting.applyFieldIde(identifier, fieldIde);
    }

    // --- Binary compatibility for connector plugin JARs built before DbType.matches() migration ---

    /** @deprecated use {@link #DORIS}.{@link #matches(String)} */
    @Deprecated
    public static boolean isDoris(String dbType) {
        return DORIS.matches(dbType);
    }

    /** @deprecated use {@link #STARROCKS}.{@link #matches(String)} */
    @Deprecated
    public static boolean isStarrocks(String dbType) {
        return STARROCKS.matches(dbType);
    }

    /** @deprecated use {@link #CLICKHOUSE}.{@link #matches(String)} */
    @Deprecated
    public static boolean isClickhouse(String dbType) {
        return CLICKHOUSE.matches(dbType);
    }

    /** @deprecated use {@link #GBASE8A}.{@link #matches(String)} */
    @Deprecated
    public static boolean isGbase8a(String dbType) {
        return GBASE8A.matches(dbType);
    }

    /** @deprecated use {@link #ELASTICSEARCH}.{@link #matches(String)} */
    @Deprecated
    public static boolean isElasticsearch(String dbType) {
        return ELASTICSEARCH.matches(dbType);
    }

    /** @deprecated use {@link #KINGBASE}.{@link #matches(String)} */
    @Deprecated
    public static boolean isKingbase(String dbType) {
        return KINGBASE.matches(dbType);
    }

    /** @deprecated use {@link #KYLIN}.{@link #matches(String)} */
    @Deprecated
    public static boolean isKylin(String dbType) {
        return KYLIN.matches(dbType);
    }

    /** @deprecated use {@link #OCEANBASE}.{@link #matches(String)} */
    @Deprecated
    public static boolean isOceanbase(String dbType) {
        return OCEANBASE.matches(dbType);
    }

    /** @deprecated use {@link #GREENPLUM}.{@link #matches(String)} */
    @Deprecated
    public static boolean isGreenplum(String dbType) {
        return GREENPLUM.matches(dbType);
    }

    /** @deprecated use {@link #OPENGAUSS}.{@link #matches(String)} */
    @Deprecated
    public static boolean isOpengauss(String dbType) {
        return OPENGAUSS.matches(dbType);
    }

    /** @deprecated use {@link #HIGHGO}.{@link #matches(String)} */
    @Deprecated
    public static boolean isHighgo(String dbType) {
        return HIGHGO.matches(dbType);
    }

    /** @deprecated use {@link #OSCAR}.{@link #matches(String)} */
    @Deprecated
    public static boolean isOscar(String dbType) {
        return OSCAR.matches(dbType);
    }

    /** @deprecated use {@link #TIDB}.{@link #matches(String)} */
    @Deprecated
    public static boolean isTidb(String dbType) {
        return TIDB.matches(dbType);
    }

    /** @deprecated use {@link #TDENGINE}.{@link #matches(String)} */
    @Deprecated
    public static boolean isTdengine(String dbType) {
        return TDENGINE.matches(dbType);
    }

    /** @deprecated use {@link #SYBASE}.{@link #matches(String)} */
    @Deprecated
    public static boolean isSybase(String dbType) {
        return SYBASE.matches(dbType);
    }

    /** @deprecated use {@link #PHOENIX}.{@link #matches(String)} */
    @Deprecated
    public static boolean isPhoenix(String dbType) {
        return PHOENIX.matches(dbType);
    }

    /** @deprecated use {@link #CACHEDB}.{@link #matches(String)} */
    @Deprecated
    public static boolean isCachedb(String dbType) {
        return CACHEDB.matches(dbType);
    }

    /** @deprecated use {@link #H2}.{@link #matches(String)} */
    @Deprecated
    public static boolean isH2(String dbType) {
        return H2.matches(dbType);
    }

    /** @deprecated use {@link #HSQL}.{@link #matches(String)} */
    @Deprecated
    public static boolean isHsql(String dbType) {
        return HSQL.matches(dbType);
    }

    /** @deprecated use {@link #PRESTO}.{@link #matches(String)} */
    @Deprecated
    public static boolean isPresto(String dbType) {
        return PRESTO.matches(dbType);
    }

    /** @deprecated use {@link #FLINK}.{@link #matches(String)} */
    @Deprecated
    public static boolean isFlink(String dbType) {
        return FLINK.matches(dbType);
    }

    /** @deprecated use {@link #GAUSSDB}.{@link #matches(String)} */
    @Deprecated
    public static boolean isGaussdb(String dbType) {
        return GAUSSDB.matches(dbType);
    }

    /** @deprecated use {@link #SQLITE3}.{@link #matches(String)} */
    @Deprecated
    public static boolean isSqlite(String dbType) {
        return SQLITE3.matches(dbType);
    }
}
