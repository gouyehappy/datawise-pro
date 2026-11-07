package org.apache.datawise.sqlparser.analysis;

import net.sf.jsqlparser.JSQLParserException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlAnalysisSupportTest {

    @Test
    void extractsTablesAliasesAndColumns() throws JSQLParserException {
        String sql = """
                SELECT ctc.name AS category_name, COUNT(ct.id) AS tag_count, category
                FROM cdp_tag ct
                JOIN cdp_tag_category ctc ON ct.category_id = ctc.id
                WHERE ct.name LIKE '%vip%'
                GROUP BY ctc.name
                ORDER BY tag_count DESC
                """;

        SqlAnalysisResult result = SqlAnalysisSupport.analyze(sql);
        assertEquals(List.of("cdp_tag", "cdp_tag_category"), List.copyOf(result.tables()));

        Map<String, String> aliases = result.aliasToTable();
        assertEquals("cdp_tag", aliases.get("ct"));
        assertEquals("cdp_tag_category", aliases.get("ctc"));

        assertTrue(result.qualifiedColumns().stream()
                .anyMatch(ref -> "ctc".equals(ref.tableOrAlias()) && "name".equals(ref.column())));
        assertTrue(result.qualifiedColumns().stream()
                .anyMatch(ref -> "ct".equals(ref.tableOrAlias()) && "id".equals(ref.column())));
        assertTrue(result.unqualifiedColumns().contains("category"));
        assertTrue(!result.unqualifiedColumns().contains("tag_count"));
    }
}
