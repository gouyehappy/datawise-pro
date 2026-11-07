package org.apache.datawise.backend.connector.presto;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PrestoDataSourceConnector;
import org.apache.datawise.backend.connector.presto.dml.PrestoFamilyDmlDialect;
import org.apache.datawise.backend.connector.presto.schema.PrestoSchemaDialect;
import org.apache.datawise.backend.connector.presto.sql.PrestoSqlPaginationDialect;
import org.apache.datawise.backend.connector.presto.support.PrestoTableMetadataIntrospection;
import org.apache.datawise.backend.connector.trino.support.TrinoFamilySchemaMetadataSupport;
import org.apache.datawise.backend.dml.spi.DmlDialect;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "io.prestosql.jdbc.PrestoDriver")
public class PrestoConnectorAutoConfiguration {

    @Bean
    TrinoFamilySchemaMetadataSupport prestoFamilySchemaMetadataSupport() {
        return new TrinoFamilySchemaMetadataSupport(DbType.PRESTO::matches);
    }

    @Bean
    PrestoSchemaDialect prestoSchemaDialect() {
        return new PrestoSchemaDialect();
    }

    @Bean
    TableMetadataIntrospection prestoTableMetadataIntrospection() {
        return new PrestoTableMetadataIntrospection();
    }

    @Bean
    DmlDialect prestoFamilyDmlDialect() {
        return new PrestoFamilyDmlDialect();
    }

    @Bean
    PrestoSqlPaginationDialect prestoSqlPaginationDialect() {
        return new PrestoSqlPaginationDialect();
    }

    @Bean
    PrestoDataSourceConnector prestoDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new PrestoDataSourceConnector(jdbc);
    }
}
