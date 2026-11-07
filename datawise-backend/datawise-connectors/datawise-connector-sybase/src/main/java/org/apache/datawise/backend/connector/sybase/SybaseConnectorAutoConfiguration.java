package org.apache.datawise.backend.connector.sybase;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.SybaseDataSourceConnector;
import org.apache.datawise.backend.connector.sybase.dml.SybaseFamilyDmlDialect;
import org.apache.datawise.backend.connector.sybase.schema.SybaseSchemaDialect;
import org.apache.datawise.backend.connector.sybase.support.SybaseSchemaMetadataSupport;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.sybase.jdbc4.jdbc.SybDriver")
public class SybaseConnectorAutoConfiguration {

    @Bean
    SybaseSchemaMetadataSupport sybaseSchemaMetadataSupport() {
        return new SybaseSchemaMetadataSupport();
    }

    @Bean
    SybaseSchemaDialect sybaseSchemaDialect() {
        return new SybaseSchemaDialect();
    }

    @Bean
    SybaseFamilyDmlDialect sybaseFamilyDmlDialect() {
        return new SybaseFamilyDmlDialect();
    }

    @Bean
    SybaseDataSourceConnector sybaseDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new SybaseDataSourceConnector(jdbc);
    }
}
