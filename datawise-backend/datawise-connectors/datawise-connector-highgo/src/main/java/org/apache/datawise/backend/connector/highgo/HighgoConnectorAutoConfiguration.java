package org.apache.datawise.backend.connector.highgo;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.highgo.ddl.HighgoDdlRenderer;
import org.apache.datawise.backend.connector.highgo.parser.HighgoLogicalTypeParser;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.apache.datawise.backend.connector.postgresql.ops.PostgresqlForkDatabaseOps;
import org.apache.datawise.backend.connector.highgo.schema.HighgoSchemaDialect;
import org.apache.datawise.backend.connector.jdbc.HighgoDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlTableIntrospector;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.highgo.jdbc.Driver")
public class HighgoConnectorAutoConfiguration {

    @Bean
    HighgoSchemaDialect highgoSchemaDialect() {
        return new HighgoSchemaDialect();
    }

    @Bean
    HighgoDdlRenderer highgoDdlRenderer() {
        return new HighgoDdlRenderer();
    }

    @Bean
    LogicalTypeParser highgoLogicalTypeParser() {
        return new HighgoLogicalTypeParser();
    }

    @Bean
    TableMetadataIntrospection highgoTableIntrospection(
            HighgoSchemaDialect highgoSchemaDialect,
            HighgoDdlRenderer highgoDdlRenderer
    ) {
        return new PostgresqlTableIntrospector(highgoSchemaDialect, highgoDdlRenderer);
    }

    @Bean
    PostgresqlConnectorOperations highgoConnectorOperations(
            HighgoSchemaDialect highgoSchemaDialect,
            HighgoDdlRenderer highgoDdlRenderer
    ) {
        return PostgresqlForkRegistration.connectorOps(highgoSchemaDialect, highgoDdlRenderer);
    }

    @Bean
    PostgresqlForkDmlDialect highgoFamilyDmlDialect() {
        return PostgresqlForkRegistration.dmlDialect(DbType.HIGHGO, 22);
    }

    @Bean
    PostgresqlForkDatabaseOps highgoDatabaseOps() {
        return PostgresqlForkRegistration.databaseOps(DbType.HIGHGO, 22);
    }

    @Bean
    HighgoDataSourceConnector highgoDataSourceConnector(
            JdbcConnectorOperations jdbc,
            PostgresqlConnectorOperations highgoConnectorOperations
    ) {
        return new HighgoDataSourceConnector(jdbc, highgoConnectorOperations);
    }
}
