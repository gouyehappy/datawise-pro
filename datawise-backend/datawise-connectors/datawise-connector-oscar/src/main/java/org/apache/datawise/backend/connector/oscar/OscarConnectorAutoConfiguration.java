package org.apache.datawise.backend.connector.oscar;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.OscarDataSourceConnector;
import org.apache.datawise.backend.connector.oscar.dml.OscarFamilyDmlDialect;
import org.apache.datawise.backend.connector.oscar.schema.OscarSchemaDialect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.oscar.Driver")
public class OscarConnectorAutoConfiguration {

    @Bean
    OscarSchemaDialect oscarSchemaDialect() {
        return new OscarSchemaDialect();
    }

    @Bean
    OscarFamilyDmlDialect oscarFamilyDmlDialect() {
        return new OscarFamilyDmlDialect();
    }

    @Bean
    OscarDataSourceConnector oscarDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new OscarDataSourceConnector(jdbc);
    }
}
