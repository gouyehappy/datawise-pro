package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 跨方言 {@link LogicalType} 规范化：源物理类型已解析为 LogicalType 后，
 * 此处只做语义级调整；目标物理类型由 {@link org.apache.datawise.backend.ddl.spi.DialectDdlRenderer} 渲染。
 */
@Primary
@Component
public class CrossDialectLogicalTypeNormalizer implements TypeMappingRegistry {

    /** MySQL utf8mb4 下单列 VARCHAR 最大字符数。 */
    static final int MYSQL_UTF8MB4_VARCHAR_MAX_CHARS = 16383;

    @Override
    public LogicalType map(LogicalType sourceType, String sourceDbType, String targetDbType) {
        if (sourceType == null) {
            return LogicalType.unknown("text");
        }
        String source = DbType.normalizeId(sourceDbType);
        String target = DbType.normalizeId(targetDbType);
        if (source.equals(target) || sameFamily(source, target)) {
            return sourceType;
        }
        return normalizeCrossFamily(sourceType, source, target);
    }

    @Override
    public String mappingWarning(LogicalType sourceType, String sourceDbType, String targetDbType) {
        if (sourceType == null) {
            return null;
        }
        String source = DbType.normalizeId(sourceDbType);
        String target = DbType.normalizeId(targetDbType);
        if (source.equals(target) || sameFamily(source, target)) {
            return null;
        }
        if (sourceType.kind() == LogicalTypeKind.ENUM || sourceType.kind() == LogicalTypeKind.SET) {
            return "enumSetDowngraded";
        }
        if (sourceType.kind() == LogicalTypeKind.UNKNOWN) {
            return "unknownSourceType";
        }
        LogicalType mapped = normalizeCrossFamily(sourceType, source, target);
        if (mapped.kind() != sourceType.kind()) {
            return "typeKindChanged";
        }
        return null;
    }

    private static LogicalType normalizeCrossFamily(LogicalType sourceType, String source, String target) {
        boolean mysqlToPg = DbType.isMysqlFamily(source) && DbType.isPostgresqlFamily(target);
        boolean pgToMysql = DbType.isPostgresqlFamily(source) && DbType.isMysqlFamily(target);
        boolean toOlap = DbType.isOlapFamily(target);
        boolean fromOlap = DbType.isOlapFamily(source);
        boolean fromMysql = DbType.isMysqlFamily(source);
        boolean toMysql = DbType.isMysqlFamily(target);

        if (!mysqlToPg && !pgToMysql && !(fromMysql && toOlap) && !(fromOlap && toMysql)
                && !(fromOlap && DbType.isPostgresqlFamily(target))
                && !(DbType.isPostgresqlFamily(source) && toOlap)) {
            return sourceType;
        }

        return switch (sourceType.kind()) {
            case TINYINT -> mysqlToPg ? logical(LogicalTypeKind.SMALLINT) : logical(LogicalTypeKind.TINYINT);
            case SMALLINT -> logical(LogicalTypeKind.SMALLINT);
            case INTEGER -> logical(LogicalTypeKind.INTEGER);
            case BIGINT -> logical(LogicalTypeKind.BIGINT);
            case DECIMAL -> copyNumeric(sourceType);
            case FLOAT -> logical(LogicalTypeKind.FLOAT);
            case DOUBLE -> logical(LogicalTypeKind.DOUBLE);
            case CHAR -> copyLength(sourceType, LogicalTypeKind.CHAR);
            case VARCHAR -> fromOlap && toMysql
                    ? mapOlapVarcharToMysql(sourceType)
                    : copyLength(sourceType, LogicalTypeKind.VARCHAR);
            case TEXT -> toOlap ? logical(LogicalTypeKind.VARCHAR) : logical(LogicalTypeKind.TEXT);
            case ENUM, SET -> toOlap ? logical(LogicalTypeKind.VARCHAR) : logical(LogicalTypeKind.TEXT);
            case BLOB, BINARY, VARBINARY -> toOlap ? logical(LogicalTypeKind.VARCHAR) : logical(LogicalTypeKind.BLOB);
            case BOOLEAN -> logical(LogicalTypeKind.BOOLEAN);
            case DATE -> logical(LogicalTypeKind.DATE);
            case TIME -> logical(LogicalTypeKind.TIME);
            case DATETIME, TIMESTAMP -> mysqlToPg || (fromMysql && toOlap)
                    ? logical(LogicalTypeKind.TIMESTAMP)
                    : logical(LogicalTypeKind.DATETIME);
            case JSON -> logical(LogicalTypeKind.JSON);
            case UUID -> logical(LogicalTypeKind.UUID);
            default -> sourceType;
        };
    }

    private static boolean sameFamily(String source, String target) {
        return (DbType.isMysqlFamily(source) && DbType.isMysqlFamily(target))
                || (DbType.isPostgresqlFamily(source) && DbType.isPostgresqlFamily(target));
    }

    private static LogicalType logical(LogicalTypeKind kind) {
        return new LogicalType(kind, null, null, null, false, null, Map.of());
    }

    private static LogicalType copyNumeric(LogicalType source) {
        return new LogicalType(LogicalTypeKind.DECIMAL, null, source.precision(), source.scale(), false, null, Map.of());
    }

    private static LogicalType copyLength(LogicalType source, LogicalTypeKind kind) {
        return new LogicalType(kind, source.length(), null, null, false, null, Map.of());
    }

    private static LogicalType mapOlapVarcharToMysql(LogicalType sourceType) {
        Integer length = sourceType.length();
        if (length == null || length <= MYSQL_UTF8MB4_VARCHAR_MAX_CHARS) {
            return copyLength(sourceType, LogicalTypeKind.VARCHAR);
        }
        return new LogicalType(LogicalTypeKind.TEXT, length, null, null, false, null, Map.of());
    }
}
