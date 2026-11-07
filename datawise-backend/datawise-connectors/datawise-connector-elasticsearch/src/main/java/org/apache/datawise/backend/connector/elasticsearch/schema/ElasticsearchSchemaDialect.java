package org.apache.datawise.backend.connector.elasticsearch.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.elasticsearch.support.ElasticsearchMetadataSupport;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;

/** Elasticsearch Explorer: flat cluster with indices listed under a synthetic namespace. */
public class ElasticsearchSchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return DbType.ELASTICSEARCH.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.ELASTICSEARCH.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, null, catalogLabel);
    }

    @Override
    public boolean isSystemCatalog(String catalog) {
        return catalog != null
                && !catalog.isBlank()
                && !ElasticsearchMetadataSupport.DEFAULT_NAMESPACE.equalsIgnoreCase(catalog.trim());
    }
}
