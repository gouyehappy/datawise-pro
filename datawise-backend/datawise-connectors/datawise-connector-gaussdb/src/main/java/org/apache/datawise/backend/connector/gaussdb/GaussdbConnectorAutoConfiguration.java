package org.apache.datawise.backend.connector.gaussdb;

import org.apache.datawise.backend.connector.jdbc.GaussdbDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.gaussdb.ddl.GaussdbDdlRenderer;
import org.apache.datawise.backend.connector.gaussdb.parser.GaussdbLogicalTypeParser;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.apache.datawise.backend.connector.postgresql.ops.PostgresqlForkDatabaseOps;
import org.apache.datawise.backend.connector.gaussdb.schema.GaussdbSchemaDialect;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlTableIntrospector;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.huawei.gaussdb.jdbc.Driver")
public class GaussdbConnectorAutoConfiguration {

    @Bean
    GaussdbSchemaDialect gaussdbSchemaDialect() {
        return new GaussdbSchemaDialect();
    }

    @Bean
    GaussdbDdlRenderer gaussdbDdlRenderer() {
        return new GaussdbDdlRenderer();
    }

    @Bean
    LogicalTypeParser gaussdbLogicalTypeParser() {
        return new GaussdbLogicalTypeParser();
    }

    @Bean
    TableMetadataIntrospection gaussdbTableIntrospection(
            GaussdbSchemaDialect gaussdbSchemaDialect,
            GaussdbDdlRenderer gaussdbDdlRenderer
    ) {
        return new PostgresqlTableIntrospector(gaussdbSchemaDialect, gaussdbDdlRenderer);
    }

    @Bean
    PostgresqlConnectorOperations gaussdbConnectorOperations(
            GaussdbSchemaDialect gaussdbSchemaDialect,
            GaussdbDdlRenderer gaussdbDdlRenderer
    ) {
        return PostgresqlForkRegistration.connectorOps(gaussdbSchemaDialect, gaussdbDdlRenderer);
    }

    @Bean
    PostgresqlForkDmlDialect gaussdbFamilyDmlDialect() {
        return PostgresqlForkRegistration.dmlDialect(DbType.GAUSSDB, 22);
    }

    @Bean
    PostgresqlForkDatabaseOps gaussdbDatabaseOps() {
        return PostgresqlForkRegistration.databaseOps(DbType.GAUSSDB, 22);
    }

    @Bean
    GaussdbDataSourceConnector gaussdbDataSourceConnector(
            JdbcConnectorOperations jdbc,
            PostgresqlConnectorOperations gaussdbConnectorOperations
    ) {
        return new GaussdbDataSourceConnector(jdbc, gaussdbConnectorOperations);
    }
}
