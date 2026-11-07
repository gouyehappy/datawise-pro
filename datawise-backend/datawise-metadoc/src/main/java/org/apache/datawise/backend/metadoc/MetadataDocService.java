package org.apache.datawise.backend.metadoc;

import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.SchemaTableSummary;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableForeignKeyDetail;
import org.apache.datawise.backend.domain.TableIndexDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
public class MetadataDocService {

    private final TableDetailService tableDetailService;

    public MetadataDocService(TableDetailService tableDetailService) {
        this.tableDetailService = tableDetailService;
    }

    public MetadataDocExportResult exportDatabase(
            String connectionId,
            String database,
            String format,
            boolean includeDetails
    ) {
        MetadataDocPreviewResult preview = previewDatabase(connectionId, database, format, includeDetails);
        MetadataDocFormat docFormat = MetadataDocFormat.parse(format);
        return new MetadataDocExportResult(
                (docFormat == MetadataDocFormat.MARKDOWN ? preview.markdown() : preview.html())
                        .getBytes(StandardCharsets.UTF_8),
                docFormat.contentType(),
                preview.fileName()
        );
    }

    public MetadataDocPreviewResult previewDatabase(
            String connectionId,
            String database,
            String format,
            boolean includeDetails
    ) {
        MetadataDocFormat docFormat = MetadataDocFormat.parse(format);
        SchemaTablesResult schemaTables = tableDetailService.loadSchemaTables(connectionId, database);
        String resolvedDatabase = schemaTables != null ? schemaTables.database() : database;
        List<SchemaTableSummary> tables = schemaTables != null && schemaTables.tables() != null
                ? schemaTables.tables()
                : List.of();
        String filename = sanitizeFileName(Objects.requireNonNullElse(resolvedDatabase, "database"))
                + "-metadoc-" + Instant.now().toEpochMilli()
                + "." + docFormat.extension();

        List<SchemaTableSummary> sorted = tables.stream()
                .filter(Objects::nonNull)
                .filter(t -> t.tableName() != null && !t.tableName().isBlank())
                .sorted(Comparator.comparing(t -> safeLower(t.tableName())))
                .toList();

        List<Map<String, Object>> tableModels = new ArrayList<>();
        for (SchemaTableSummary t : sorted) {
            String tableName = t.tableName();
            String comment = t.comment() == null ? null : t.comment().trim();
            Map<String, Object> tableModel = new LinkedHashMap<>();
            tableModel.put("tableName", tableName);
            tableModel.put("comment", comment);

            if (!includeDetails) {
                tableModel.put("columns", List.of());
                tableModel.put("indexes", List.of());
                tableModel.put("foreignKeys", List.of());
                tableModels.add(tableModel);
                continue;
            }

            TablePropertiesResult props = tableDetailService.loadProperties(tableName, connectionId, resolvedDatabase);
            List<TableColumnDetail> cols = props != null && props.columns() != null ? props.columns() : List.of();
            List<TableIndexDetail> indexes = props != null && props.indexes() != null ? props.indexes() : List.of();
            List<TableForeignKeyDetail> foreignKeys = props != null && props.foreignKeys() != null ? props.foreignKeys() : List.of();

            List<Map<String, Object>> columnModels = cols.stream()
                    .sorted(Comparator.comparingInt(TableColumnDetail::ordinal))
                    .map((c) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("ordinal", c.ordinal());
                        m.put("name", nullToDash(c.name()));
                        m.put("nameMd", escapePipes(nullToDash(c.name())));
                        m.put("dataType", nullToDash(c.dataType()));
                        m.put("dataTypeMd", escapePipes(nullToDash(c.dataType())));
                        m.put("nullableYn", c.nullable() ? "Y" : "N");
                        m.put("keyYn", "PRI".equalsIgnoreCase(c.keyType()) ? "Y" : "");
                        m.put("defaultValue", nullToDash(c.defaultValue()));
                        m.put("defaultValueMd", escapePipes(nullToDash(c.defaultValue())));
                        m.put("autoIncrementYn", c.autoIncrement() ? "Y" : "");
                        String cmt = c.comment() == null ? null : c.comment().trim();
                        m.put("comment", cmt);
                        m.put("commentMd", escapePipes(nullToDash(cmt)));
                        return m;
                    })
                    .toList();

            List<Map<String, Object>> indexModels = indexes.stream()
                    .map((idx) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("name", idx.name());
                        m.put("nameMd", idx.name() == null ? "-" : escapePipes(nullToDash(idx.name())));
                        m.put("uniqueYn", idx.unique() ? "Y" : "N");
                        m.put("columns", idx.columns());
                        m.put("columnsMd", escapePipes(nullToDash(idx.columns())));
                        return m;
                    })
                    .toList();

            List<Map<String, Object>> foreignKeyModels = foreignKeys.stream()
                    .map((fk) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("name", fk.name());
                        m.put("nameMd", fk.name() == null ? "-" : escapePipes(nullToDash(fk.name())));
                        m.put("columns", fk.columns());
                        m.put("columnsMd", escapePipes(nullToDash(fk.columns())));
                        m.put("referenceTable", fk.referenceTable());
                        m.put("referenceTableMd", escapePipes(nullToDash(fk.referenceTable())));
                        m.put("referenceColumns", fk.referenceColumns());
                        m.put("referenceColumnsMd", escapePipes(nullToDash(fk.referenceColumns())));
                        return m;
                    })
                    .toList();

            tableModel.put("columns", columnModels);
            tableModel.put("indexes", indexModels);
            tableModel.put("foreignKeys", foreignKeyModels);
            tableModels.add(tableModel);
        }

        Map<String, Object> model = new HashMap<>();
        model.put("database", resolvedDatabase);
        model.put("connectionId", connectionId);
        model.put("includeDetails", includeDetails);
        model.put("tables", tableModels);

        String markdown = FreeMarkerConfig.render("markdown/database.ftl", model);
        String html = FreeMarkerConfig.render("html/database.ftl", model);

        return new MetadataDocPreviewResult(
                resolvedDatabase,
                connectionId,
                docFormat.name().toLowerCase(Locale.ROOT),
                filename,
                markdown,
                html
        );
    }

    private static String nullToDash(String value) {
        if (value == null) {
            return "-";
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? "-" : trimmed;
    }

    private static String escapePipes(String value) {
        return value == null ? "-" : value.replace("|", "\\|");
    }

    private static String sanitizeFileName(String name) {
        String trimmed = name != null ? name.trim() : "export";
        String safe = trimmed.replaceAll("[\\\\/:*?\"<>|\\s]+", "_");
        return safe.isBlank() ? "export" : safe;
    }

    private static String safeLower(String value) {
        return value == null ? "" : value.toLowerCase(java.util.Locale.ROOT);
    }

}

