package org.apache.datawise.backend.connector.doris.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.ddl.render.DialectSqlSupport;
import org.apache.datawise.backend.ddl.render.OlapCreateTableSupport;
import org.apache.datawise.backend.ddl.spi.DialectDdlRenderer;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.apache.datawise.backend.metadata.TableDefinition;

import java.util.ArrayList;
import java.util.List;

/** Apache Doris DDL 渲染（OLAP，独立于 MySQL 族）。 */
public class DorisDdlRenderer implements DialectDdlRenderer {

    @Override
    public String dialectId() {
        return DbType.DORIS.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.DORIS.matches(dbType);
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
        StringBuilder sb = new StringBuilder("CREATE TABLE ").append(qualified).append(" (\n");
        sb.append(String.join(",\n", lines)).append("\n)");
        OlapCreateTableSupport.appendOlapTableTail(sb, definition, options);
        sb.append(";");
        return sb.toString();
    }

    @Override
    public String renderPhysicalType(LogicalType type) {
        if (type == null) {
            return "string";
        }
        if (type.rawTypeName() != null && !type.rawTypeName().isBlank() && type.kind() == LogicalTypeKind.UNKNOWN) {
            return type.rawTypeName();
        }
        return switch (type.kind()) {
            case TINYINT, SMALLINT -> "smallint";
            case INTEGER -> "int";
            case BIGINT -> "bigint";
            case DECIMAL -> DialectSqlSupport.renderDecimal("decimal", type);
            case FLOAT -> "float";
            case DOUBLE -> "double";
            case CHAR, VARCHAR -> type.length() != null ? "varchar(" + type.length() + ")" : "varchar(255)";
            case TEXT, ENUM, SET -> "string";
            case BLOB, BINARY, VARBINARY -> "string";
            case BOOLEAN -> "boolean";
            case DATE -> "date";
            case TIME -> "varchar(32)";
            case DATETIME, TIMESTAMP -> "datetime";
            case JSON -> "json";
            case UUID -> "varchar(36)";
            default -> type.rawTypeName() != null ? type.rawTypeName() : "string";
        };
    }

    private String renderColumn(ColumnDefinition column) {
        StringBuilder sb = new StringBuilder();
        sb.append(DialectSqlSupport.quoteBacktick(column.name()))
                .append(' ')
                .append(renderPhysicalType(column.type()));
        if (!column.nullable()) {
            sb.append(" NOT NULL");
        } else {
            sb.append(" NULL");
        }
        String defaultClause = DorisDdlSupport.formatDefaultClause(column.defaultExpression());
        if (defaultClause != null) {
            sb.append(" DEFAULT ").append(defaultClause);
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
}
