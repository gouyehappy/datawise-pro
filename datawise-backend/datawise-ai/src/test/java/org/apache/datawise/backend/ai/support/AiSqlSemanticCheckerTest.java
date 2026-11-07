package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.schema.AiTableDdlSnippet;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiSqlSemanticCheckerTest {

    @Test
    void passesWhenReferencedTablesExistInSchema() {
        AiSqlSchemaContext schema = new AiSqlSchemaContext(
                "conn",
                "db1",
                "mysql",
                List.of("orders", "customers"),
                List.of()
        );

        AiSqlSemanticChecker.SemanticCheckResult result = AiSqlSemanticChecker.check(
                "SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id",
                schema
        );

        assertTrue(result.ok());
    }

    @Test
    void failsWhenSqlReferencesUnknownTable() {
        AiSqlSchemaContext schema = new AiSqlSchemaContext(
                "conn",
                "db1",
                "mysql",
                List.of("orders"),
                List.of()
        );

        AiSqlSemanticChecker.SemanticCheckResult result = AiSqlSemanticChecker.check(
                "SELECT * FROM ghost_table",
                schema
        );

        assertFalse(result.ok());
        assertFalse(result.columnIssue());
    }

    @Test
    void failsWhenSqlReferencesUnknownColumnFromDdl() {
        String ddl = """
                CREATE TABLE `cdp_tag` (
                  `id` bigint NOT NULL,
                  `name` varchar(255) DEFAULT NULL,
                  `category_id` bigint DEFAULT NULL,
                  PRIMARY KEY (`id`)
                )
                """;
        AiSqlSchemaContext schema = new AiSqlSchemaContext(
                "conn",
                "db1",
                "mysql",
                List.of("cdp_tag"),
                List.of(new AiTableDdlSnippet("cdp_tag", ddl))
        );

        AiSqlSemanticChecker.SemanticCheckResult result = AiSqlSemanticChecker.check(
                "SELECT category, COUNT(*) FROM cdp_tag",
                schema
        );

        assertFalse(result.ok());
        assertTrue(result.columnIssue());
    }

    @Test
    void passesWhenColumnsExistInDdl() {
        String ddl = """
                CREATE TABLE `cdp_tag` (
                  `id` bigint NOT NULL,
                  `name` varchar(255) DEFAULT NULL,
                  `category_id` bigint DEFAULT NULL,
                  PRIMARY KEY (`id`)
                )
                """;
        AiSqlSchemaContext schema = new AiSqlSchemaContext(
                "conn",
                "db1",
                "mysql",
                List.of("cdp_tag"),
                List.of(new AiTableDdlSnippet("cdp_tag", ddl))
        );

        AiSqlSemanticChecker.SemanticCheckResult result = AiSqlSemanticChecker.check(
                "SELECT name, category_id FROM cdp_tag WHERE name IS NOT NULL",
                schema
        );

        assertTrue(result.ok());
    }
}
