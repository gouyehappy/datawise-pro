package org.apache.datawise.backend.database.drift;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.migration.TableMigrationPreflightSupport;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * MetaForge A2：把结构差异渲染为可在目标方言执行的同步 SQL（优先 ADD COLUMN；
 * 类型/可空差异出 MODIFY；注释/默认值差异出方言化语句；DROP 标 destructive 注释；
 * 整表缺失时由调用方附上源 DDL）。
 */
public final class SchemaDriftSyncSql {

    private SchemaDriftSyncSql() {
    }

    public static String buildColumnSyncSql(
            String targetDbType,
            String targetDatabase,
            String tableName,
            List<TableColumnDetail> sourceColumns,
            List<String> missingOnTarget,
            List<String> extraOnTarget
    ) {
        return buildColumnSyncSql(
                targetDbType,
                targetDatabase,
                tableName,
                sourceColumns,
                missingOnTarget,
                extraOnTarget,
                List.of(),
                List.of()
        );
    }

    public static String buildColumnSyncSql(
            String targetDbType,
            String targetDatabase,
            String tableName,
            List<TableColumnDetail> sourceColumns,
            List<String> missingOnTarget,
            List<String> extraOnTarget,
            List<String> typeMismatches
    ) {
        return buildColumnSyncSql(
                targetDbType,
                targetDatabase,
                tableName,
                sourceColumns,
                missingOnTarget,
                extraOnTarget,
                typeMismatches,
                List.of()
        );
    }

    public static String buildColumnSyncSql(
            String targetDbType,
            String targetDatabase,
            String tableName,
            List<TableColumnDetail> sourceColumns,
            List<String> missingOnTarget,
            List<String> extraOnTarget,
            List<String> typeMismatches,
            List<String> attributeMismatches
    ) {
        if (tableName == null || tableName.isBlank()) {
            return null;
        }
        Map<String, TableColumnDetail> byName = indexByName(sourceColumns);
        String qualified = DbType.quoteQualifiedTable(targetDbType, targetDatabase, tableName);
        List<String> statements = new ArrayList<>();
        Set<String> typeModified = new HashSet<>();

        if (missingOnTarget != null) {
            for (String missing : missingOnTarget) {
                TableColumnDetail column = byName.get(normalize(missing));
                if (column == null) {
                    continue;
                }
                statements.add(renderAddColumn(targetDbType, qualified, column));
            }
        }
        if (typeMismatches != null) {
            for (String label : typeMismatches) {
                String columnName = TableMigrationPreflightSupport.typeMismatchColumnName(label);
                TableColumnDetail column = byName.get(normalize(columnName));
                if (column == null) {
                    continue;
                }
                typeModified.add(normalize(column.name()));
                statements.add(renderModifyColumn(targetDbType, qualified, column));
            }
        }
        if (attributeMismatches != null) {
            for (String label : attributeMismatches) {
                String columnName = TableMigrationPreflightSupport.typeMismatchColumnName(label);
                TableColumnDetail column = byName.get(normalize(columnName));
                if (column == null) {
                    continue;
                }
                String normalized = normalize(column.name());
                // MySQL MODIFY already embeds COMMENT/DEFAULT from columnDefinition.
                if (typeModified.contains(normalized)
                        && (DbType.isMysqlFamily(targetDbType) || DbType.isMysqlProtocol(targetDbType))) {
                    continue;
                }
                String attrSql = renderAttributeSync(targetDbType, qualified, column);
                if (attrSql != null && !attrSql.isBlank()) {
                    statements.add(attrSql);
                }
            }
        }
        if (extraOnTarget != null) {
            for (String extra : extraOnTarget) {
                if (extra == null || extra.isBlank()) {
                    continue;
                }
                String quotedCol = DbType.quoteIdentifier(targetDbType, extra.trim());
                statements.add(
                        "-- destructive\n"
                                + "ALTER TABLE " + qualified + " DROP COLUMN " + quotedCol + ";"
                );
            }
        }
        if (statements.isEmpty()) {
            return null;
        }
        return String.join("\n", statements) + "\n";
    }

    public static String wrapCreateTableDdl(String ddl) {
        if (ddl == null || ddl.isBlank()) {
            return null;
        }
        String text = ddl.trim();
        if (!text.endsWith(";")) {
            text = text + ";";
        }
        return text + "\n";
    }

    private static String renderAddColumn(String dbType, String qualifiedTable, TableColumnDetail column) {
        StringBuilder sb = new StringBuilder();
        sb.append("ALTER TABLE ").append(qualifiedTable).append(" ADD COLUMN ");
        sb.append(columnDefinition(dbType, column));
        sb.append(';');
        return sb.toString();
    }

    private static String renderModifyColumn(String dbType, String qualifiedTable, TableColumnDetail column) {
        String def = columnDefinition(dbType, column);
        String quotedCol = DbType.quoteIdentifier(dbType, column.name());
        if (DbType.isSqlite(dbType)) {
            return "-- review: SQLite lacks portable MODIFY COLUMN for "
                    + quotedCol
                    + " ("
                    + (column.dataType() != null ? column.dataType().trim() : "?")
                    + ")";
        }
        if (DbType.isMysqlFamily(dbType) || DbType.isMysqlProtocol(dbType)) {
            return "-- review\nALTER TABLE " + qualifiedTable + " MODIFY COLUMN " + def + ";";
        }
        if (DbType.isPostgresqlFamily(dbType)) {
            StringBuilder sb = new StringBuilder();
            sb.append("-- review\n");
            sb.append("ALTER TABLE ").append(qualifiedTable)
                    .append(" ALTER COLUMN ").append(quotedCol)
                    .append(" TYPE ").append(typeOnly(column)).append(";");
            if (!column.nullable()) {
                sb.append("\nALTER TABLE ").append(qualifiedTable)
                        .append(" ALTER COLUMN ").append(quotedCol)
                        .append(" SET NOT NULL;");
            } else {
                sb.append("\nALTER TABLE ").append(qualifiedTable)
                        .append(" ALTER COLUMN ").append(quotedCol)
                        .append(" DROP NOT NULL;");
            }
            return sb.toString();
        }
        if (DbType.isSqlServerFamily(dbType)) {
            return "-- review\nALTER TABLE " + qualifiedTable + " ALTER COLUMN " + def + ";";
        }
        if (DbType.isDmFamily(dbType) || DbType.isOscar(dbType)
                || "oracle".equals(DbType.normalizeId(dbType))) {
            return "-- review\nALTER TABLE " + qualifiedTable + " MODIFY (" + def + ");";
        }
        return "-- review\nALTER TABLE " + qualifiedTable + " MODIFY COLUMN " + def + ";";
    }

    private static String renderAttributeSync(String dbType, String qualifiedTable, TableColumnDetail column) {
        String quotedCol = DbType.quoteIdentifier(dbType, column.name());
        if (DbType.isMysqlFamily(dbType) || DbType.isMysqlProtocol(dbType)) {
            return "-- review\nALTER TABLE " + qualifiedTable + " MODIFY COLUMN "
                    + columnDefinition(dbType, column) + ";";
        }
        if (DbType.isPostgresqlFamily(dbType)) {
            List<String> parts = new ArrayList<>();
            parts.add("-- review");
            if (column.comment() != null && !column.comment().isBlank()) {
                parts.add("COMMENT ON COLUMN " + qualifiedTable + "." + quotedCol
                        + " IS '" + escapeSqlLiteral(column.comment()) + "';");
            } else {
                parts.add("COMMENT ON COLUMN " + qualifiedTable + "." + quotedCol + " IS NULL;");
            }
            if (column.defaultValue() != null && !column.defaultValue().isBlank()) {
                parts.add("ALTER TABLE " + qualifiedTable + " ALTER COLUMN " + quotedCol
                        + " SET DEFAULT " + column.defaultValue().trim() + ";");
            } else {
                parts.add("ALTER TABLE " + qualifiedTable + " ALTER COLUMN " + quotedCol
                        + " DROP DEFAULT;");
            }
            return String.join("\n", parts);
        }
        if (DbType.isSqlite(dbType)) {
            return "-- review: SQLite lacks portable COMMENT/DEFAULT ALTER for " + quotedCol;
        }
        return "-- review\nALTER TABLE " + qualifiedTable + " MODIFY COLUMN "
                + columnDefinition(dbType, column) + ";";
    }

    private static String columnDefinition(String dbType, TableColumnDetail column) {
        StringBuilder sb = new StringBuilder();
        sb.append(DbType.quoteIdentifier(dbType, column.name())).append(' ');
        sb.append(typeOnly(column));
        if (!column.nullable()) {
            sb.append(" NOT NULL");
        }
        if (column.defaultValue() != null && !column.defaultValue().isBlank()) {
            sb.append(" DEFAULT ").append(column.defaultValue().trim());
        }
        if ((DbType.isMysqlFamily(dbType) || DbType.isMysqlProtocol(dbType))
                && column.comment() != null
                && !column.comment().isBlank()) {
            sb.append(" COMMENT '").append(escapeSqlLiteral(column.comment())).append("'");
        }
        return sb.toString();
    }

    private static String escapeSqlLiteral(String value) {
        return value.replace("'", "''");
    }

    private static String typeOnly(TableColumnDetail column) {
        if (column.dataType() != null && !column.dataType().isBlank()) {
            return column.dataType().trim();
        }
        return "TEXT";
    }

    private static Map<String, TableColumnDetail> indexByName(List<TableColumnDetail> columns) {
        Map<String, TableColumnDetail> map = new LinkedHashMap<>();
        if (columns == null) {
            return map;
        }
        for (TableColumnDetail column : columns) {
            if (column == null || column.name() == null || column.name().isBlank()) {
                continue;
            }
            map.putIfAbsent(normalize(column.name()), column);
        }
        return map;
    }

    private static String normalize(String name) {
        return name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
    }
}
