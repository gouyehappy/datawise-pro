package org.apache.datawise.backend.ddl.translate;

import org.apache.datawise.backend.common.DbType;

import java.util.Locale;
import java.util.Set;

/** Resolves schema names and normalizes db types for cross-dialect DDL. */
final class CrossDialectSchemaResolver {

    private static final Set<String> MYSQL_FAMILY = DbType.mysqlFamilyIds();

    String schemaForSource(String sourceDbType, String sourceDatabase) {
        String normalized = normalizeDbType(sourceDbType);
        if (MYSQL_FAMILY.contains(normalized) || DbType.isOlapFamily(normalized)) {
            return sourceDatabase;
        }
        return sourceDatabase != null && !sourceDatabase.isBlank() ? sourceDatabase : "public";
    }

    String normalizeDbType(String dbType) {
        return DbType.normalizeId(dbType);
    }

    String sanitizeDefault(String defaultExpression, String sourceDbType, String targetDbType) {
        if (defaultExpression == null || defaultExpression.isBlank()) {
            return null;
        }
        if (!normalizeDbType(sourceDbType).equals(normalizeDbType(targetDbType))
                && defaultExpression.toLowerCase(Locale.ROOT).contains("nextval(")) {
            return null;
        }
        return defaultExpression;
    }
}
