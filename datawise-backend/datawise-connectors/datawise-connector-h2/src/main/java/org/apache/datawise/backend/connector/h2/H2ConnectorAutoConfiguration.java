package org.apache.datawise.backend.connector.h2;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.H2DataSourceConnector;
import org.apache.datawise.backend.connector.h2.dml.H2FamilyDmlDialect;
import org.apache.datawise.backend.connector.h2.schema.H2SchemaDialect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.h2.Driver")
public class H2ConnectorAutoConfiguration {

    @Bean
    H2SchemaDialect h2SchemaDialect() {
        return new H2SchemaDialect();
    }

    @Bean
    H2FamilyDmlDialect h2FamilyDmlDialect() {
        return new H2FamilyDmlDialect();
    }

    @Bean
    H2DataSourceConnector h2DataSourceConnector(JdbcConnectorOperations jdbc) {
        return new H2DataSourceConnector(jdbc);
    }
}
