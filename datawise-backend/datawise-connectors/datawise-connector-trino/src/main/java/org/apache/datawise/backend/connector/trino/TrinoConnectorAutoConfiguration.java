package org.apache.datawise.backend.connector.trino;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.TrinoDataSourceConnector;
import org.apache.datawise.backend.connector.trino.dml.TrinoFamilyDmlDialect;
import org.apache.datawise.backend.connector.trino.schema.TrinoSchemaDialect;
import org.apache.datawise.backend.connector.trino.sql.TrinoSqlPaginationDialect;
import org.apache.datawise.backend.connector.trino.support.TrinoFamilySchemaMetadataSupport;
import org.apache.datawise.backend.connector.trino.support.TrinoTableMetadataIntrospection;
import org.apache.datawise.backend.dml.spi.DmlDialect;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "io.trino.jdbc.TrinoDriver")
public class TrinoConnectorAutoConfiguration {

    @Bean
    TrinoFamilySchemaMetadataSupport trinoFamilySchemaMetadataSupport() {
        return new TrinoFamilySchemaMetadataSupport(DbType.TRINO::matches);
    }

    @Bean
    TrinoSchemaDialect trinoSchemaDialect() {
        return new TrinoSchemaDialect();
    }

    @Bean
    TableMetadataIntrospection trinoTableMetadataIntrospection() {
        return new TrinoTableMetadataIntrospection();
    }

    @Bean
    DmlDialect trinoFamilyDmlDialect() {
        return new TrinoFamilyDmlDialect();
    }

    @Bean
    TrinoSqlPaginationDialect trinoSqlPaginationDialect() {
        return new TrinoSqlPaginationDialect();
    }

    @Bean
    TrinoDataSourceConnector trinoDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new TrinoDataSourceConnector(jdbc);
    }
}
