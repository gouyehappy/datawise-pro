package org.apache.datawise.backend.connector.elasticsearch.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ElasticsearchFamilyDmlDialectTest {

    @Test
    void supportsElasticsearch() {
        ElasticsearchFamilyDmlDialect dialect = new ElasticsearchFamilyDmlDialect();
        assertTrue(dialect.supports("elasticsearch"));
    }

    @Test
    void quotesIndexNames() {
        ElasticsearchFamilyDmlDialect dialect = new ElasticsearchFamilyDmlDialect();
        assertEquals("\"logs\"", dialect.quoteIdentifier("logs"));
        assertEquals("\"logs\"", dialect.qualifiedTable("elasticsearch", "logs"));
    }
}
