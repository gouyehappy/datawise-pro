package org.apache.datawise.backend.connector.kingbase;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.KingbaseDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.kingbase.ddl.KingbaseDdlRenderer;
import org.apache.datawise.backend.connector.kingbase.parser.KingbaseLogicalTypeParser;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.apache.datawise.backend.connector.postgresql.ops.PostgresqlForkDatabaseOps;
import org.apache.datawise.backend.connector.kingbase.schema.KingbaseSchemaDialect;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlTableIntrospector;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.kingbase8.Driver")
public class KingbaseConnectorAutoConfiguration {

    @Bean
    KingbaseSchemaDialect kingbaseSchemaDialect() {
        return new KingbaseSchemaDialect();
    }

    @Bean
    KingbaseDdlRenderer kingbaseDdlRenderer() {
        return new KingbaseDdlRenderer();
    }

    @Bean
    LogicalTypeParser kingbaseLogicalTypeParser() {
        return new KingbaseLogicalTypeParser();
    }

    @Bean
    TableMetadataIntrospection kingbaseTableIntrospection(
            KingbaseSchemaDialect kingbaseSchemaDialect,
            KingbaseDdlRenderer kingbaseDdlRenderer
    ) {
        return new PostgresqlTableIntrospector(kingbaseSchemaDialect, kingbaseDdlRenderer);
    }

    @Bean
    PostgresqlConnectorOperations kingbaseConnectorOperations(
            KingbaseSchemaDialect kingbaseSchemaDialect,
            KingbaseDdlRenderer kingbaseDdlRenderer
    ) {
        return PostgresqlForkRegistration.connectorOps(kingbaseSchemaDialect, kingbaseDdlRenderer);
    }

    @Bean
    PostgresqlForkDmlDialect kingbaseFamilyDmlDialect() {
        return PostgresqlForkRegistration.dmlDialect(DbType.KINGBASE, 22);
    }

    @Bean
    PostgresqlForkDatabaseOps kingbaseDatabaseOps() {
        return PostgresqlForkRegistration.databaseOps(DbType.KINGBASE, 22);
    }

    @Bean
    KingbaseDataSourceConnector kingbaseDataSourceConnector(
            JdbcConnectorOperations jdbc,
            PostgresqlConnectorOperations kingbaseConnectorOperations
    ) {
        return new KingbaseDataSourceConnector(jdbc, kingbaseConnectorOperations);
    }
}
