package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiSqlReferencedTablesTest {

    @Test
    void extractsFromAndJoinTables() {
        String sql = """
                SELECT ctc.name AS category_name, COUNT(ct.id) AS tag_count
                FROM cdp_tag ct
                JOIN cdp_tag_category ctc ON ct.category_id = ctc.id
                """;
        assertEquals(List.of("cdp_tag", "cdp_tag_category"), AiSqlReferencedTables.extract(sql));
    }
}
