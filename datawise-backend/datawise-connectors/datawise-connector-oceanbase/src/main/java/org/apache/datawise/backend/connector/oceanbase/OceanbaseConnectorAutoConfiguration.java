package org.apache.datawise.backend.connector.oceanbase;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.OceanbaseDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkActiveSessionOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkLockWaitOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkSessionKillOps;
import org.apache.datawise.backend.connector.mysql.schema.MysqlForkSchemaDialect;
import org.apache.datawise.backend.connector.mysql.support.MysqlTableIntrospector;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.oceanbase.jdbc.Driver")
public class OceanbaseConnectorAutoConfiguration {

    @Bean
    MysqlForkSchemaDialect oceanbaseSchemaDialect() {
        return MysqlForkRegistration.schemaDialect(DbType.OCEANBASE);
    }

    @Bean
    MysqlForkDmlDialect oceanbaseFamilyDmlDialect() {
        return MysqlForkRegistration.dmlDialect(DbType.OCEANBASE, 22);
    }

    @Bean
    MysqlForkActiveSessionOps oceanbaseActiveSessionOps() {
        return MysqlForkRegistration.activeSessionOps(DbType.OCEANBASE, 22);
    }

    @Bean
    MysqlForkLockWaitOps oceanbaseLockWaitOps() {
        return MysqlForkRegistration.lockWaitOps(DbType.OCEANBASE, 22);
    }

    @Bean
    MysqlForkSessionKillOps oceanbaseSessionKillOps() {
        return MysqlForkRegistration.sessionKillOps(DbType.OCEANBASE, 22);
    }

    @Bean
    TableMetadataIntrospection oceanbaseTableIntrospector() {
        return new MysqlTableIntrospector();
    }

    @Bean
    OceanbaseDataSourceConnector oceanbaseDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new OceanbaseDataSourceConnector(jdbc);
    }
}
