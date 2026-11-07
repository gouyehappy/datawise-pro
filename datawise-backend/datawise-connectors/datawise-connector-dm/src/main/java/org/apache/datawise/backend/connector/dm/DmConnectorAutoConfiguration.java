package org.apache.datawise.backend.connector.dm;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.dm.ops.DmFamilyDatabaseOps;
import org.apache.datawise.backend.connector.dm.schema.DmSchemaDialect;
import org.apache.datawise.backend.connector.jdbc.DmDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.schema.introspect.oracle.OracleFamilySchemaMetadataSupport;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "dm.jdbc.driver.DmDriver")
public class DmConnectorAutoConfiguration {

    @Bean
    OracleFamilySchemaMetadataSupport dmSchemaMetadataSupport() {
        return new OracleFamilySchemaMetadataSupport(DbType::isDmFamily);
    }

    @Bean
    DmSchemaDialect dmSchemaDialect() {
        return new DmSchemaDialect();
    }

    @Bean
    DmFamilyDatabaseOps dmFamilyDatabaseOps() {
        return new DmFamilyDatabaseOps();
    }

    @Bean
    DmDataSourceConnector dmDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new DmDataSourceConnector(jdbc);
    }
}
