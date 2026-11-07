package org.apache.datawise.backend.connector.db2;

import org.apache.datawise.backend.connector.db2.ops.Db2FamilyDatabaseOps;
import org.apache.datawise.backend.connector.db2.schema.Db2SchemaDialect;
import org.apache.datawise.backend.connector.db2.support.Db2SchemaMetadataSupport;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.connector.jdbc.Db2DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.ibm.db2.jcc.DB2Driver")
public class Db2ConnectorAutoConfiguration {

    @Bean
    Db2SchemaMetadataSupport db2SchemaMetadataSupport(SchemaDialectRegistry dialectRegistry) {
        return new Db2SchemaMetadataSupport(dialectRegistry);
    }

    @Bean
    Db2SchemaDialect db2SchemaDialect() {
        return new Db2SchemaDialect();
    }

    @Bean
    Db2FamilyDatabaseOps db2FamilyDatabaseOps() {
        return new Db2FamilyDatabaseOps();
    }

    @Bean
    Db2DataSourceConnector db2DataSourceConnector(JdbcConnectorOperations jdbc) {
        return new Db2DataSourceConnector(jdbc);
    }
}
