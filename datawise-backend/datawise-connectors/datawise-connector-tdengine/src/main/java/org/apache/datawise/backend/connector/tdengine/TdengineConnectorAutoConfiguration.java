package org.apache.datawise.backend.connector.tdengine;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.TdengineDataSourceConnector;
import org.apache.datawise.backend.connector.tdengine.dml.TdengineFamilyDmlDialect;
import org.apache.datawise.backend.connector.tdengine.schema.TdengineSchemaDialect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.taosdata.jdbc.rs.RestfulDriver")
public class TdengineConnectorAutoConfiguration {

    @Bean
    TdengineSchemaDialect tdengineSchemaDialect() {
        return new TdengineSchemaDialect();
    }

    @Bean
    TdengineFamilyDmlDialect tdengineFamilyDmlDialect() {
        return new TdengineFamilyDmlDialect();
    }

    @Bean
    TdengineDataSourceConnector tdengineDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new TdengineDataSourceConnector(jdbc);
    }
}
