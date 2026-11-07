package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiDdlColumnIndexTest {

    @Test
    void extractsColumnsFromMysqlCreateTable() {
        String ddl = """
                CREATE TABLE `cdp_tag` (
                  `id` bigint NOT NULL AUTO_INCREMENT,
                  `name` varchar(255) DEFAULT NULL,
                  `category_id` bigint DEFAULT NULL,
                  PRIMARY KEY (`id`),
                  KEY `idx_category` (`category_id`)
                ) ENGINE=InnoDB
                """;
        Set<String> columns = AiDdlColumnIndex.extractColumns(ddl);
        assertTrue(columns.contains("id"));
        assertTrue(columns.contains("name"));
        assertTrue(columns.contains("category_id"));
    }

    @Test
    void extractsColumnsFromPostgresqlCreateTable() {
        String ddl = """
                CREATE TABLE public.cdp_tag_category (
                  id bigint NOT NULL,
                  name varchar(255),
                  parent_id bigint
                );
                """;
        Set<String> columns = AiDdlColumnIndex.extractColumns(ddl);
        assertTrue(columns.contains("id"));
        assertTrue(columns.contains("name"));
        assertTrue(columns.contains("parent_id"));
    }
}
