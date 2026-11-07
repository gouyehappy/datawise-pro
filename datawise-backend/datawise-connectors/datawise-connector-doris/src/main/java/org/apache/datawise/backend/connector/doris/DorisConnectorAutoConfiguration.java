package org.apache.datawise.backend.connector.doris;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.doris.ddl.DorisDdlRenderer;
import org.apache.datawise.backend.connector.doris.schema.DorisSchemaDialect;
import org.apache.datawise.backend.connector.doris.support.DorisTableIntrospector;
import org.apache.datawise.backend.connector.jdbc.DorisDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.mysql.cj.jdbc.Driver")
public class DorisConnectorAutoConfiguration {

    @Bean
    DorisSchemaDialect dorisSchemaDialect() {
        return new DorisSchemaDialect();
    }

    @Bean
    DorisDdlRenderer dorisDdlRenderer() {
        return new DorisDdlRenderer();
    }

    @Bean
    MysqlForkDmlDialect dorisDmlDialect() {
        return MysqlForkRegistration.dmlDialect(DbType.DORIS, 20);
    }

    @Bean
    TableMetadataIntrospection dorisTableIntrospection() {
        return new DorisTableIntrospector();
    }

    @Bean
    DorisDataSourceConnector dorisDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new DorisDataSourceConnector(jdbc);
    }
}
