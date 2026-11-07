package org.apache.datawise.backend.connector.opengauss;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.OpengaussDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.opengauss.ddl.OpengaussDdlRenderer;
import org.apache.datawise.backend.connector.opengauss.parser.OpengaussLogicalTypeParser;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.apache.datawise.backend.connector.postgresql.ops.PostgresqlForkDatabaseOps;
import org.apache.datawise.backend.connector.opengauss.schema.OpengaussSchemaDialect;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlTableIntrospector;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.opengauss.Driver")
public class OpengaussConnectorAutoConfiguration {

    @Bean
    OpengaussSchemaDialect opengaussSchemaDialect() {
        return new OpengaussSchemaDialect();
    }

    @Bean
    OpengaussDdlRenderer opengaussDdlRenderer() {
        return new OpengaussDdlRenderer();
    }

    @Bean
    LogicalTypeParser opengaussLogicalTypeParser() {
        return new OpengaussLogicalTypeParser();
    }

    @Bean
    TableMetadataIntrospection opengaussTableIntrospection(
            OpengaussSchemaDialect opengaussSchemaDialect,
            OpengaussDdlRenderer opengaussDdlRenderer
    ) {
        return new PostgresqlTableIntrospector(opengaussSchemaDialect, opengaussDdlRenderer);
    }

    @Bean
    PostgresqlConnectorOperations opengaussConnectorOperations(
            OpengaussSchemaDialect opengaussSchemaDialect,
            OpengaussDdlRenderer opengaussDdlRenderer
    ) {
        return PostgresqlForkRegistration.connectorOps(opengaussSchemaDialect, opengaussDdlRenderer);
    }

    @Bean
    PostgresqlForkDmlDialect opengaussFamilyDmlDialect() {
        return PostgresqlForkRegistration.dmlDialect(DbType.OPENGAUSS, 22);
    }

    @Bean
    PostgresqlForkDatabaseOps opengaussDatabaseOps() {
        return PostgresqlForkRegistration.databaseOps(DbType.OPENGAUSS, 22);
    }

    @Bean
    OpengaussDataSourceConnector opengaussDataSourceConnector(
            JdbcConnectorOperations jdbc,
            PostgresqlConnectorOperations opengaussConnectorOperations
    ) {
        return new OpengaussDataSourceConnector(jdbc, opengaussConnectorOperations);
    }
}
