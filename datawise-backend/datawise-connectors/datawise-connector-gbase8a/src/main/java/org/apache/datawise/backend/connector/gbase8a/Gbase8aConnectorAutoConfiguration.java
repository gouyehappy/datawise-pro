package org.apache.datawise.backend.connector.gbase8a;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.gbase8a.support.Gbase8aTableIntrospector;
import org.apache.datawise.backend.connector.jdbc.Gbase8aDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkActiveSessionOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkLockWaitOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkSessionKillOps;
import org.apache.datawise.backend.connector.mysql.schema.MysqlForkSchemaDialect;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.gbase.jdbc.Driver")
public class Gbase8aConnectorAutoConfiguration {

    @Bean
    MysqlForkSchemaDialect gbase8aSchemaDialect() {
        return MysqlForkRegistration.schemaDialect(DbType.GBASE8A);
    }

    @Bean
    MysqlForkDmlDialect gbase8aFamilyDmlDialect() {
        return MysqlForkRegistration.dmlDialect(DbType.GBASE8A, 20);
    }

    @Bean
    MysqlForkActiveSessionOps gbase8aActiveSessionOps() {
        return MysqlForkRegistration.activeSessionOps(DbType.GBASE8A, 21);
    }

    @Bean
    MysqlForkLockWaitOps gbase8aLockWaitOps() {
        return MysqlForkRegistration.lockWaitOps(DbType.GBASE8A, 21);
    }

    @Bean
    MysqlForkSessionKillOps gbase8aSessionKillOps() {
        return MysqlForkRegistration.sessionKillOps(DbType.GBASE8A, 21);
    }

    @Bean
    TableMetadataIntrospection gbase8aTableIntrospector() {
        return new Gbase8aTableIntrospector();
    }

    @Bean
    Gbase8aDataSourceConnector gbase8aDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new Gbase8aDataSourceConnector(jdbc);
    }
}
