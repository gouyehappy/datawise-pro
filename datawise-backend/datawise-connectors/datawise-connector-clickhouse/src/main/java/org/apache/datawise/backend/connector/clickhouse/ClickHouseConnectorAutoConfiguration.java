package org.apache.datawise.backend.connector.clickhouse;

import org.apache.datawise.backend.connector.clickhouse.schema.ClickHouseSchemaDialect;
import org.apache.datawise.backend.connector.clickhouse.support.ClickHouseSchemaMetadataSupport;
import org.apache.datawise.backend.connector.jdbc.ClickHouseDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.clickhouse.jdbc.ClickHouseDriver")
public class ClickHouseConnectorAutoConfiguration {

    @Bean
    ClickHouseSchemaMetadataSupport clickHouseSchemaMetadataSupport() {
        return new ClickHouseSchemaMetadataSupport();
    }

    @Bean
    ClickHouseSchemaDialect clickHouseSchemaDialect() {
        return new ClickHouseSchemaDialect();
    }

    @Bean
    ClickHouseDataSourceConnector clickHouseDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new ClickHouseDataSourceConnector(jdbc);
    }
}
