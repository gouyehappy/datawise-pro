package org.apache.datawise.backend.connector.greenplum;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.greenplum.ddl.GreenplumDdlRenderer;
import org.apache.datawise.backend.connector.greenplum.parser.GreenplumLogicalTypeParser;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.apache.datawise.backend.connector.postgresql.ops.PostgresqlForkDatabaseOps;
import org.apache.datawise.backend.connector.greenplum.schema.GreenplumSchemaDialect;
import org.apache.datawise.backend.connector.jdbc.GreenplumDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlTableIntrospector;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.postgresql.Driver")
public class GreenplumConnectorAutoConfiguration {

    @Bean
    GreenplumSchemaDialect greenplumSchemaDialect() {
        return new GreenplumSchemaDialect();
    }

    @Bean
    GreenplumDdlRenderer greenplumDdlRenderer() {
        return new GreenplumDdlRenderer();
    }

    @Bean
    LogicalTypeParser greenplumLogicalTypeParser() {
        return new GreenplumLogicalTypeParser();
    }

    @Bean
    TableMetadataIntrospection greenplumTableIntrospection(
            GreenplumSchemaDialect greenplumSchemaDialect,
            GreenplumDdlRenderer greenplumDdlRenderer
    ) {
        return new PostgresqlTableIntrospector(greenplumSchemaDialect, greenplumDdlRenderer);
    }

    @Bean
    PostgresqlConnectorOperations greenplumConnectorOperations(
            GreenplumSchemaDialect greenplumSchemaDialect,
            GreenplumDdlRenderer greenplumDdlRenderer
    ) {
        return PostgresqlForkRegistration.connectorOps(greenplumSchemaDialect, greenplumDdlRenderer);
    }

    @Bean
    PostgresqlForkDmlDialect greenplumFamilyDmlDialect() {
        return PostgresqlForkRegistration.dmlDialect(DbType.GREENPLUM, 22);
    }

    @Bean
    PostgresqlForkDatabaseOps greenplumDatabaseOps() {
        return PostgresqlForkRegistration.databaseOps(DbType.GREENPLUM, 22);
    }

    @Bean
    GreenplumDataSourceConnector greenplumDataSourceConnector(
            JdbcConnectorOperations jdbc,
            PostgresqlConnectorOperations greenplumConnectorOperations
    ) {
        return new GreenplumDataSourceConnector(jdbc, greenplumConnectorOperations);
    }
}
