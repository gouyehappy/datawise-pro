package org.apache.datawise.backend.connector.hive;

import org.apache.datawise.backend.connector.hive.dml.HiveFamilyDmlDialect;
import org.apache.datawise.backend.connector.hive.schema.HiveSchemaDialect;
import org.apache.datawise.backend.connector.hive.sql.HiveSqlPaginationDialect;
import org.apache.datawise.backend.connector.hive.explorer.HiveSchemaExplorer;
import org.apache.datawise.backend.connector.hive.support.HiveSchemaMetadataSupport;
import org.apache.datawise.backend.connector.hive.support.HiveTableMetadataIntrospection;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;
import org.apache.datawise.backend.connector.jdbc.HiveDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.dml.spi.DmlDialect;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class HiveConnectorAutoConfiguration {

    @Bean
    HiveSchemaMetadataSupport hiveSchemaMetadataSupport() {
        return new HiveSchemaMetadataSupport();
    }

    @Bean
    HiveSchemaDialect hiveSchemaDialect() {
        return new HiveSchemaDialect();
    }

    @Bean
    JdbcSchemaExplorer hiveSchemaExplorer() {
        return new HiveSchemaExplorer();
    }

    @Bean
    TableMetadataIntrospection hiveTableMetadataIntrospection() {
        return new HiveTableMetadataIntrospection();
    }

    @Bean
    DmlDialect hiveFamilyDmlDialect() {
        return new HiveFamilyDmlDialect();
    }

    @Bean
    HiveSqlPaginationDialect hiveSqlPaginationDialect() {
        return new HiveSqlPaginationDialect();
    }

    @Bean
    HiveDataSourceConnector hiveDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new HiveDataSourceConnector(jdbc);
    }
}
