package org.apache.datawise.backend.connector.phoenix;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PhoenixDataSourceConnector;
import org.apache.datawise.backend.connector.phoenix.dml.PhoenixFamilyDmlDialect;
import org.apache.datawise.backend.connector.phoenix.schema.PhoenixSchemaDialect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.apache.phoenix.queryserver.client.Driver")
public class PhoenixConnectorAutoConfiguration {

    @Bean
    PhoenixSchemaDialect phoenixSchemaDialect() {
        return new PhoenixSchemaDialect();
    }

    @Bean
    PhoenixFamilyDmlDialect phoenixFamilyDmlDialect() {
        return new PhoenixFamilyDmlDialect();
    }

    @Bean
    PhoenixDataSourceConnector phoenixDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new PhoenixDataSourceConnector(jdbc);
    }
}
