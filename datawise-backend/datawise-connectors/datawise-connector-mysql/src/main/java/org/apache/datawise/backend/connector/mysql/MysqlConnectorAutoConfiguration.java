package org.apache.datawise.backend.connector.mysql;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.MysqlDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.ddl.MysqlDdlRenderer;
import org.apache.datawise.backend.connector.mysql.dml.MysqlFamilyDmlDialect;
import org.apache.datawise.backend.connector.mysql.ops.MysqlFamilyLockWaitOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlProtocolActiveSessionOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlProtocolSessionKillOps;
import org.apache.datawise.backend.connector.mysql.schema.MysqlSchemaDialect;
import org.apache.datawise.backend.connector.mysql.support.MysqlSchemaMetadataSupport;
import org.apache.datawise.backend.connector.mysql.support.MysqlTableIntrospector;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.mysql.cj.jdbc.Driver")
public class MysqlConnectorAutoConfiguration {

    @Bean
    MysqlSchemaMetadataSupport mysqlSchemaMetadataSupport(SchemaDialectRegistry dialectRegistry) {
        return new MysqlSchemaMetadataSupport(dialectRegistry);
    }

    @Bean
    MysqlSchemaDialect mysqlSchemaDialect() {
        return new MysqlSchemaDialect();
    }

    @Bean
    MysqlDdlRenderer mysqlDdlRenderer() {
        return new MysqlDdlRenderer();
    }

    @Bean
    TableMetadataIntrospection mysqlTableIntrospection() {
        return new MysqlTableIntrospector();
    }

    @Bean
    MysqlFamilyDmlDialect mysqlFamilyDmlDialect() {
        return new MysqlFamilyDmlDialect();
    }

    @Bean
    MysqlProtocolActiveSessionOps mysqlProtocolActiveSessionOps() {
        return new MysqlProtocolActiveSessionOps();
    }

    @Bean
    MysqlFamilyLockWaitOps mysqlFamilyLockWaitOps() {
        return new MysqlFamilyLockWaitOps();
    }

    @Bean
    MysqlProtocolSessionKillOps mysqlProtocolSessionKillOps() {
        return new MysqlProtocolSessionKillOps();
    }

    @Bean
    MysqlDataSourceConnector mysqlDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new MysqlDataSourceConnector(jdbc);
    }
}
