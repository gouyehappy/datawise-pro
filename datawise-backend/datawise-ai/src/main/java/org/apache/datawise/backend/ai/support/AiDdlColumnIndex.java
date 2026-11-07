package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.schema.AiTableDdlSnippet;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 从 CREATE TABLE DDL 片段提取列名索引（表名 → 列名集合）。
 */
public final class AiDdlColumnIndex {

    private static final Set<String> DDL_SKIP_NAMES = Set.of(
            "primary", "key", "constraint", "unique", "index", "foreign", "check", "fulltext",
            "spatial", "references", "create", "table", "if", "not", "null", "default",
            "auto_increment", "generated", "stored", "virtual", "comment", "engine", "charset",
            "collate", "using", "btree", "hash", "on", "delete", "update", "cascade", "restrict",
            "unsigned", "zerofill", "character", "set", "row", "format", "dynamic", "compressed",
            "partition", "by", "range", "list", "values", "less", "than", "maxvalue", "minvalue",
            "in", "linear", "columns", "subpartition", "partitions", "tablespace", "storage",
            "with", "without", "oids", "global", "local", "include", "exclude", "where", "deferrable",
            "initially", "deferred", "match", "simple", "no", "action", "asc", "desc", "nulls",
            "first", "last", "fillfactor", "tablegroup", "compression", "distributed", "replicated"
    );

    private static final Pattern COLUMN_WITH_TYPE = Pattern.compile(
            "[`\"]?([a-zA-Z_][a-zA-Z0-9_]*)[`\"]?"
                    + "\\s+(?:bigint|bigserial|binary|bit|bool|boolean|char(?:acter)?(?:\\(\\d+\\))?"
                    + "|date|datetime|decimal|double|enum|float|int|integer|json|longblob|longtext"
                    + "|mediumblob|mediumint|mediumtext|numeric|real|serial|smallint|text|time"
                    + "|timestamp|tinyblob|tinyint|tinytext|varbinary|varchar(?:\\(\\d+\\))?"
                    + "|uuid|bytea|jsonb|set)\\b",
            Pattern.CASE_INSENSITIVE
    );

    private AiDdlColumnIndex() {
    }

    public static Map<String, Set<String>> fromDdls(List<AiTableDdlSnippet> ddls) {
        Map<String, Set<String>> index = new HashMap<>();
        if (ddls == null) {
            return index;
        }
        for (AiTableDdlSnippet snippet : ddls) {
            if (snippet == null || snippet.table() == null || snippet.table().isBlank()) {
                continue;
            }
            Set<String> columns = extractColumns(snippet.ddl());
            if (!columns.isEmpty()) {
                index.put(snippet.table().toLowerCase(Locale.ROOT), columns);
            }
        }
        return index;
    }

    public static Set<String> extractColumns(String ddl) {
        Set<String> columns = new HashSet<>();
        if (ddl == null || ddl.isBlank()) {
            return columns;
        }
        Matcher matcher = COLUMN_WITH_TYPE.matcher(ddl);
        while (matcher.find()) {
            String name = matcher.group(1);
            if (name == null || name.isBlank()) {
                continue;
            }
            String lower = name.toLowerCase(Locale.ROOT);
            if (!DDL_SKIP_NAMES.contains(lower)) {
                columns.add(lower);
            }
        }
        return columns;
    }
}
