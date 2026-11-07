package org.apache.datawise.backend.ddl.render;

import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.metadata.TableDefinition;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Doris / StarRocks 建表共用尾部：ENGINE、DUPLICATE KEY、COMMENT、DISTRIBUTED BY、PROPERTIES。
 * 表级 COMMENT 须在 ENGINE/KEY 之后，不能放在 {@code )} 与 ENGINE 之间（StarRocks 语法要求）。
 */
public final class OlapCreateTableSupport {

    public static final int DEFAULT_BUCKETS = 10;

    private OlapCreateTableSupport() {
    }

    public static List<String> resolveKeyColumns(TableDefinition definition) {
        if (definition.primaryKey() != null && !definition.primaryKey().columnNames().isEmpty()) {
            return definition.primaryKey().columnNames();
        }
        if (!definition.columns().isEmpty()) {
            return List.of(definition.columns().get(0).name());
        }
        return List.of("id");
    }

    public static String resolveHashColumn(TableDefinition definition) {
        return resolveKeyColumns(definition).get(0);
    }

    public static void appendOlapTableTail(StringBuilder sb, TableDefinition definition) {
        appendOlapTableTail(sb, definition, null);
    }

    public static void appendOlapTableTail(
                                           StringBuilder sb,
                                           TableDefinition definition,
                                           DdlRenderOptions options) {
        sb.append("\nENGINE=OLAP");
        appendDuplicateKey(sb, definition);
        appendTableComment(sb, definition, options);
        appendDistributedByHash(sb, definition);
        sb.append("\nPROPERTIES (\"replication_num\" = \"1\")");
    }

    private static void appendTableComment(
                                           StringBuilder sb,
                                           TableDefinition definition,
                                           DdlRenderOptions options) {
        if (options == null || !options.includeComments()) {
            return;
        }
        String comment = definition.comment();
        if (comment == null || comment.isBlank()) {
            return;
        }
        sb.append("\nCOMMENT \"")
                .append(DialectSqlSupport.escapeDoubleQuote(comment))
                .append("\"");
    }

    private static void appendDuplicateKey(StringBuilder sb, TableDefinition definition) {
        String keys = resolveKeyColumns(definition).stream()
                .map(DialectSqlSupport::quoteBacktick)
                .collect(Collectors.joining(", "));
        sb.append("\nDUPLICATE KEY(").append(keys).append(")");
    }

    private static void appendDistributedByHash(StringBuilder sb, TableDefinition definition) {
        sb.append("\nDISTRIBUTED BY HASH(")
                .append(DialectSqlSupport.quoteBacktick(resolveHashColumn(definition)))
                .append(") BUCKETS ")
                .append(DEFAULT_BUCKETS);
    }
}
