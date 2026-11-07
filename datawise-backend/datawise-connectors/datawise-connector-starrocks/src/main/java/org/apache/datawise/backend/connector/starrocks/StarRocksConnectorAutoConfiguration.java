package org.apache.datawise.backend.connector.starrocks;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.StarRocksDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.apache.datawise.backend.connector.starrocks.ddl.StarRocksDdlRenderer;
import org.apache.datawise.backend.connector.starrocks.schema.StarRocksSchemaDialect;
import org.apache.datawise.backend.connector.starrocks.support.StarRocksTableIntrospector;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.mysql.cj.jdbc.Driver")
public class StarRocksConnectorAutoConfiguration {

    @Bean
    StarRocksSchemaDialect starRocksSchemaDialect() {
        return new StarRocksSchemaDialect();
    }

    @Bean
    StarRocksDdlRenderer starRocksDdlRenderer() {
        return new StarRocksDdlRenderer();
    }

    @Bean
    MysqlForkDmlDialect starRocksDmlDialect() {
        return MysqlForkRegistration.dmlDialect(DbType.STARROCKS, 20);
    }

    @Bean
    TableMetadataIntrospection starRocksTableIntrospection() {
        return new StarRocksTableIntrospector();
    }

    @Bean
    StarRocksDataSourceConnector starRocksDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new StarRocksDataSourceConnector(jdbc);
    }
}
