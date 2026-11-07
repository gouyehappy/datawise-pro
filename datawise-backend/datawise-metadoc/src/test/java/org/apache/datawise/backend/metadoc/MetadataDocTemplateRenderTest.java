package org.apache.datawise.backend.metadoc;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class MetadataDocTemplateRenderTest {

    @Test
    void rendersMarkdownAndHtmlTemplates() {
        Map<String, Object> column = new HashMap<>();
        column.put("ordinal", 1);
        column.put("name", "id");
        column.put("nameMd", "id");
        column.put("dataType", "int");
        column.put("dataTypeMd", "int");
        column.put("nullableYn", "N");
        column.put("keyYn", "Y");
        column.put("defaultValue", "-");
        column.put("defaultValueMd", "-");
        column.put("autoIncrementYn", "");
        column.put("comment", "pk");
        column.put("commentMd", "pk");

        Map<String, Object> index = new HashMap<>();
        index.put("name", "idx_id");
        index.put("nameMd", "idx_id");
        index.put("uniqueYn", "N");
        index.put("columns", "id");
        index.put("columnsMd", "id");

        Map<String, Object> fk = new HashMap<>();
        fk.put("name", "fk_t");
        fk.put("nameMd", "fk_t");
        fk.put("columns", "id");
        fk.put("columnsMd", "id");
        fk.put("referenceTable", "ref_t");
        fk.put("referenceTableMd", "ref_t");
        fk.put("referenceColumns", "id");
        fk.put("referenceColumnsMd", "id");

        Map<String, Object> table = new HashMap<>();
        table.put("tableName", "t_user");
        table.put("comment", "用户表");
        table.put("columns", List.of(column));
        table.put("indexes", List.of(index));
        table.put("foreignKeys", List.of(fk));

        Map<String, Object> model = new HashMap<>();
        model.put("database", "db1");
        model.put("connectionId", "c1");
        model.put("includeDetails", true);
        model.put("tables", List.of(table));

        String markdown = FreeMarkerConfig.render("markdown/database.ftl", model);
        String html = FreeMarkerConfig.render("html/database.ftl", model);

        assertNotNull(markdown);
        assertNotNull(html);
        assertFalse(markdown.isBlank());
        assertFalse(html.isBlank());
    }

    @Test
    void rendersWithoutDetails() {
        Map<String, Object> table = new HashMap<>();
        table.put("tableName", "t_user");
        table.put("comment", null);
        table.put("columns", List.of());
        table.put("indexes", List.of());
        table.put("foreignKeys", List.of());

        Map<String, Object> model = new HashMap<>();
        model.put("database", "db1");
        model.put("connectionId", "c1");
        model.put("includeDetails", false);
        model.put("tables", List.of(table));

        String markdown = FreeMarkerConfig.render("markdown/database.ftl", model);
        assertNotNull(markdown);
        assertFalse(markdown.isBlank());
    }
}

