package org.apache.datawise.backend.connector.mysql.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.ddl.render.DialectSqlSupport;
import org.apache.datawise.backend.ddl.spi.DialectDdlRenderer;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.apache.datawise.backend.metadata.TableDefinition;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** MySQL 族 DDL 渲染（mysql / mariadb / oceanbase / tidb / gbase8a）。 */
public class MysqlDdlRenderer implements DialectDdlRenderer {

    private static final Set<String> SUPPORTED = DbType.mysqlFamilyIds();
    /** MySQL utf8mb4 下单列 VARCHAR 最大字符数。 */
    private static final int MYSQL_UTF8MB4_VARCHAR_MAX_CHARS = 16383;
    /** 超过该字符数时使用 longtext，否则 mediumtext。 */
    private static final int MYSQL_MEDIUMTEXT_CHAR_HINT = 65535;

    @Override
    public String dialectId() {
        return "mysql";
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && SUPPORTED.contains(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String renderCreateTable(TableDefinition definition, DdlRenderOptions options) {
        String database = resolveDatabase(definition, options);
        String qualified = DialectSqlSupport.quoteBacktick(database) + "."
                + DialectSqlSupport.quoteBacktick(definition.name());
        List<String> lines = new ArrayList<>();
        for (ColumnDefinition column : definition.columns()) {
            lines.add("  " + renderColumn(column));
        }
        if (definition.primaryKey() != null && !definition.primaryKey().columnNames().isEmpty()) {
            lines.add("  PRIMARY KEY ("
                    + String.join(", ", definition.primaryKey().columnNames().stream()
                    .map(DialectSqlSupport::quoteBacktick).toList())
                    + ")");
        }
        StringBuilder sb = new StringBuilder("CREATE TABLE ").append(qualified).append(" (\n");
        sb.append(String.join(",\n", lines)).append("\n)");
        if (definition.comment() != null && !definition.comment().isBlank()
                && options != null && options.includeComments()) {
            sb.append(" COMMENT='").append(DialectSqlSupport.escapeSingleQuote(definition.comment())).append("'");
        }
        sb.append(";");
        return sb.toString();
    }

    @Override
    public String renderPhysicalType(LogicalType type) {
        if (type == null) {
            return "text";
        }
        if (type.rawTypeName() != null && !type.rawTypeName().isBlank() && type.kind() == LogicalTypeKind.UNKNOWN) {
            return type.rawTypeName();
        }
        return switch (type.kind()) {
            case TINYINT -> type.unsigned() ? "tinyint unsigned" : "tinyint";
            case SMALLINT -> type.unsigned() ? "smallint unsigned" : "smallint";
            case INTEGER -> type.unsigned() ? "int unsigned" : "int";
            case BIGINT -> type.unsigned() ? "bigint unsigned" : "bigint";
            case DECIMAL -> DialectSqlSupport.renderDecimal("decimal", type);
            case FLOAT -> "float";
            case DOUBLE -> "double";
            case CHAR -> type.length() != null ? "char(" + type.length() + ")" : "char(1)";
            case VARCHAR -> renderMysqlVarchar(type);
            case TEXT, ENUM, SET -> renderMysqlText(type);
            case BLOB, BINARY, VARBINARY -> "blob";
            case BOOLEAN -> "tinyint(1)";
            case DATE -> "date";
            case TIME -> "time";
            case DATETIME -> "datetime";
            case TIMESTAMP -> "timestamp";
            case JSON -> "json";
            case UUID -> "varchar(36)";
            default -> type.rawTypeName() != null ? type.rawTypeName() : "text";
        };
    }

    private String renderColumn(ColumnDefinition column) {
        StringBuilder sb = new StringBuilder();
        sb.append(DialectSqlSupport.quoteBacktick(column.name()))
                .append(' ')
                .append(renderPhysicalType(column.type()));
        if (!column.nullable()) {
            sb.append(" NOT NULL");
        }
        if (column.autoIncrement()) {
            sb.append(" AUTO_INCREMENT");
        } else if (column.defaultExpression() != null && !column.defaultExpression().isBlank()) {
            sb.append(" DEFAULT ").append(column.defaultExpression());
        }
        if (column.comment() != null && !column.comment().isBlank()) {
            sb.append(" COMMENT '").append(DialectSqlSupport.escapeSingleQuote(column.comment())).append("'");
        }
        return sb.toString();
    }

    private static String resolveDatabase(TableDefinition definition, DdlRenderOptions options) {
        if (options != null && options.targetDatabase() != null && !options.targetDatabase().isBlank()) {
            return options.targetDatabase();
        }
        return definition.schema();
    }

    private static String renderMysqlVarchar(LogicalType type) {
        Integer length = type.length();
        if (length == null) {
            return "varchar(255)";
        }
        if (length > MYSQL_UTF8MB4_VARCHAR_MAX_CHARS) {
            return length > MYSQL_MEDIUMTEXT_CHAR_HINT ? "longtext" : "mediumtext";
        }
        return "varchar(" + length + ")";
    }

    private static String renderMysqlText(LogicalType type) {
        Integer length = type.length();
        if (length != null && length > MYSQL_MEDIUMTEXT_CHAR_HINT) {
            return "longtext";
        }
        if (length != null && length > MYSQL_UTF8MB4_VARCHAR_MAX_CHARS) {
            return "mediumtext";
        }
        return "text";
    }
}
