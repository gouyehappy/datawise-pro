package org.apache.datawise.backend.connector.tidb;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.TidbDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.apache.datawise.backend.connector.mysql.schema.MysqlForkSchemaDialect;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.mysql.cj.jdbc.Driver")
public class TidbConnectorAutoConfiguration {

    @Bean
    MysqlForkSchemaDialect tidbSchemaDialect() {
        return MysqlForkRegistration.schemaDialect(DbType.TIDB);
    }

    @Bean
    MysqlForkDmlDialect tidbFamilyDmlDialect() {
        return MysqlForkRegistration.dmlDialect(DbType.TIDB, 21);
    }

    @Bean
    TidbDataSourceConnector tidbDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new TidbDataSourceConnector(jdbc);
    }
}
