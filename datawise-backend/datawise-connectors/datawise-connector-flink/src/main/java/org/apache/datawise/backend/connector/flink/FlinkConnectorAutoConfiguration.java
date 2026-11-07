package org.apache.datawise.backend.connector.flink;

import org.apache.datawise.backend.connector.flink.dml.FlinkFamilyDmlDialect;
import org.apache.datawise.backend.connector.flink.schema.FlinkSchemaDialect;
import org.apache.datawise.backend.connector.flink.sql.FlinkSqlPaginationDialect;
import org.apache.datawise.backend.connector.flink.support.FlinkTableMetadataIntrospection;
import org.apache.datawise.backend.connector.jdbc.FlinkDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.dml.spi.DmlDialect;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.apache.flink.table.jdbc.FlinkDriver")
public class FlinkConnectorAutoConfiguration {

    @Bean
    FlinkSchemaDialect flinkSchemaDialect() {
        return new FlinkSchemaDialect();
    }

    @Bean
    TableMetadataIntrospection flinkTableMetadataIntrospection() {
        return new FlinkTableMetadataIntrospection();
    }

    @Bean
    DmlDialect flinkFamilyDmlDialect() {
        return new FlinkFamilyDmlDialect();
    }

    @Bean
    FlinkSqlPaginationDialect flinkSqlPaginationDialect() {
        return new FlinkSqlPaginationDialect();
    }

    @Bean
    FlinkDataSourceConnector flinkDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new FlinkDataSourceConnector(jdbc);
    }
}
