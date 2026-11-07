package org.apache.datawise.backend.connector.postgresql;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PostgresqlDataSourceConnector;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlFamilyDmlDialect;
import org.apache.datawise.backend.connector.postgresql.ops.PostgresqlFamilyDatabaseOps;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlSchemaMetadataSupport;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlTableIntrospector;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.postgresql.Driver")
public class PostgresqlConnectorAutoConfiguration {

    @Bean
    PostgresqlSchemaMetadataSupport postgresqlSchemaMetadataSupport(SchemaDialectRegistry dialectRegistry) {
        return new PostgresqlSchemaMetadataSupport(dialectRegistry);
    }

    @Bean
    PostgresqlSchemaDialect postgresqlSchemaDialect() {
        return new PostgresqlSchemaDialect();
    }

    @Bean
    PostgresqlDdlRenderer postgresqlDdlRenderer() {
        return new PostgresqlDdlRenderer();
    }

    @Bean
    LogicalTypeParser postgresqlLogicalTypeParser() {
        return new PostgresqlLogicalTypeParser();
    }

    @Bean
    TableMetadataIntrospection postgresqlTableIntrospection(
            PostgresqlSchemaDialect postgresqlSchemaDialect,
            @Qualifier("postgresqlDdlRenderer") PostgresqlDdlRenderer postgresqlDdlRenderer
    ) {
        return new PostgresqlTableIntrospector(postgresqlSchemaDialect, postgresqlDdlRenderer);
    }

    @Bean
    PostgresqlConnectorOperations postgresqlConnectorOperations(
            @Qualifier("postgresqlTableIntrospection") TableMetadataIntrospection introspection,
            @Qualifier("postgresqlDdlRenderer") PostgresqlDdlRenderer ddlRenderer
    ) {
        return new PostgresqlConnectorOperations(introspection, ddlRenderer);
    }

    @Bean
    PostgresqlFamilyDmlDialect postgresqlFamilyDmlDialect() {
        return new PostgresqlFamilyDmlDialect();
    }

    @Bean
    PostgresqlFamilyDatabaseOps postgresqlFamilyDatabaseOps() {
        return new PostgresqlFamilyDatabaseOps();
    }

    @Bean
    PostgresqlDataSourceConnector postgresqlDataSourceConnector(
            JdbcConnectorOperations jdbc,
            @Qualifier("postgresqlConnectorOperations") PostgresqlConnectorOperations postgresql
    ) {
        return new PostgresqlDataSourceConnector(jdbc, postgresql);
    }
}
