package org.apache.datawise.backend.connector.kylin;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.KylinDataSourceConnector;
import org.apache.datawise.backend.connector.kylin.explorer.KylinSchemaExplorer;
import org.apache.datawise.backend.connector.kylin.schema.KylinSchemaDialect;
import org.apache.datawise.backend.connector.kylin.support.KylinTableIntrospector;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.apache.kylin.jdbc.Driver")
public class KylinConnectorAutoConfiguration {

    @Bean
    KylinSchemaDialect kylinSchemaDialect() {
        return new KylinSchemaDialect();
    }

    @Bean
    TableMetadataIntrospection kylinTableIntrospector() {
        return new KylinTableIntrospector();
    }

    @Bean
    JdbcSchemaExplorer kylinSchemaExplorer() {
        return new KylinSchemaExplorer();
    }

    @Bean
    KylinDataSourceConnector kylinDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new KylinDataSourceConnector(jdbc);
    }
}
