package org.apache.datawise.backend.connector.hsql;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.HsqlDataSourceConnector;
import org.apache.datawise.backend.connector.hsql.dml.HsqlFamilyDmlDialect;
import org.apache.datawise.backend.connector.hsql.schema.HsqlSchemaDialect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.hsqldb.jdbc.JDBCDriver")
public class HsqlConnectorAutoConfiguration {

    @Bean
    HsqlSchemaDialect hsqlSchemaDialect() {
        return new HsqlSchemaDialect();
    }

    @Bean
    HsqlFamilyDmlDialect hsqlFamilyDmlDialect() {
        return new HsqlFamilyDmlDialect();
    }

    @Bean
    HsqlDataSourceConnector hsqlDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new HsqlDataSourceConnector(jdbc);
    }
}
