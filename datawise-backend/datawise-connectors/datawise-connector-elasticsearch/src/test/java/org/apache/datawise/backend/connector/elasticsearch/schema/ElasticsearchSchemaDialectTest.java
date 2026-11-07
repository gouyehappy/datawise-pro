package org.apache.datawise.backend.connector.elasticsearch.schema;

import org.apache.datawise.backend.connector.elasticsearch.support.ElasticsearchMetadataSupport;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ElasticsearchSchemaDialectTest {

    @Test
    void supportsElasticsearch() {
        ElasticsearchSchemaDialect dialect = new ElasticsearchSchemaDialect();
        assertTrue(dialect.supports("elasticsearch"));
        assertFalse(dialect.supports("mysql"));
    }

    @Test
    void keepsSyntheticNamespaceVisible() {
        ElasticsearchSchemaDialect dialect = new ElasticsearchSchemaDialect();
        assertFalse(dialect.isSystemCatalog(ElasticsearchMetadataSupport.DEFAULT_NAMESPACE));
    }
}
