package org.apache.datawise.backend.connector.cachedb;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.CachedbDataSourceConnector;
import org.apache.datawise.backend.connector.cachedb.dml.CachedbFamilyDmlDialect;
import org.apache.datawise.backend.connector.cachedb.schema.CachedbSchemaDialect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.intersys.jdbc.CacheDriver")
public class CachedbConnectorAutoConfiguration {

    @Bean
    CachedbSchemaDialect cachedbSchemaDialect() {
        return new CachedbSchemaDialect();
    }

    @Bean
    CachedbFamilyDmlDialect cachedbFamilyDmlDialect() {
        return new CachedbFamilyDmlDialect();
    }

    @Bean
    CachedbDataSourceConnector cachedbDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new CachedbDataSourceConnector(jdbc);
    }
}
