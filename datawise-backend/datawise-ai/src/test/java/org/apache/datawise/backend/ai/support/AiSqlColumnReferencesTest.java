package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiSqlColumnReferencesTest {

    @Test
    void extractsQualifiedAndUnqualifiedColumns() {
        String sql = """
                SELECT ctc.name AS category_name, COUNT(ct.id) AS tag_count, category
                FROM cdp_tag ct
                JOIN cdp_tag_category ctc ON ct.category_id = ctc.id
                WHERE ct.name LIKE '%vip%'
                GROUP BY ctc.name
                ORDER BY tag_count DESC
                """;
        Map<String, String> aliases = AiSqlAliasMap.build(sql);

        List<AiSqlColumnReferences.QualifiedColumn> qualified = AiSqlColumnReferences.extractQualified(sql);
        assertTrue(qualified.stream().anyMatch(ref -> "ctc".equals(ref.tableOrAlias()) && "name".equals(ref.column())));
        assertTrue(qualified.stream().anyMatch(ref -> "ct".equals(ref.tableOrAlias()) && "id".equals(ref.column())));
        assertTrue(qualified.stream().anyMatch(ref -> "ct".equals(ref.tableOrAlias()) && "category_id".equals(ref.column())));

        List<String> unqualified = AiSqlColumnReferences.extractUnqualified(sql, aliases);
        assertTrue(unqualified.contains("category"));
        assertTrue(!unqualified.contains("tag_count"));
    }

    @Test
    void buildsAliasMapFromFromAndJoin() {
        String sql = "SELECT * FROM cdp_tag ct JOIN cdp_tag_category ctc ON ct.category_id = ctc.id";
        Map<String, String> aliases = AiSqlAliasMap.build(sql);
        assertEquals("cdp_tag", aliases.get("ct"));
        assertEquals("cdp_tag_category", aliases.get("ctc"));
    }
}
