package org.apache.datawise.backend.connector.elasticsearch;

import org.apache.datawise.backend.connector.elasticsearch.explorer.ElasticsearchSchemaExplorer;
import org.apache.datawise.backend.connector.elasticsearch.schema.ElasticsearchSchemaDialect;
import org.apache.datawise.backend.connector.elasticsearch.support.ElasticsearchTableIntrospector;
import org.apache.datawise.backend.connector.jdbc.ElasticsearchDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.elasticsearch.xpack.sql.jdbc.EsDriver")
public class ElasticsearchConnectorAutoConfiguration {

    @Bean
    ElasticsearchSchemaDialect elasticsearchSchemaDialect() {
        return new ElasticsearchSchemaDialect();
    }

    @Bean
    TableMetadataIntrospection elasticsearchTableIntrospector() {
        return new ElasticsearchTableIntrospector();
    }

    @Bean
    JdbcSchemaExplorer elasticsearchSchemaExplorer() {
        return new ElasticsearchSchemaExplorer();
    }

    @Bean
    ElasticsearchConnectorOperations elasticsearchConnectorOperations() {
        return new ElasticsearchConnectorOperations();
    }

    @Bean
    ElasticsearchDataSourceConnector elasticsearchDataSourceConnector(
            JdbcConnectorOperations jdbc,
            ElasticsearchConnectorOperations rest
    ) {
        return new ElasticsearchDataSourceConnector(jdbc, rest);
    }
}
