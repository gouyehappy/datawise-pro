package org.apache.datawise.backend.connector.sqlserver;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.SqlServerDataSourceConnector;
import org.apache.datawise.backend.connector.sqlserver.ops.SqlServerFamilyDatabaseOps;
import org.apache.datawise.backend.connector.sqlserver.schema.SqlServerSchemaDialect;
import org.apache.datawise.backend.connector.sqlserver.support.SqlServerSchemaMetadataSupport;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.microsoft.sqlserver.jdbc.SQLServerDriver")
public class SqlServerConnectorAutoConfiguration {

    @Bean
    SqlServerSchemaDialect sqlServerSchemaDialect() {
        return new SqlServerSchemaDialect();
    }

    @Bean
    SqlServerFamilyDatabaseOps sqlServerFamilyDatabaseOps() {
        return new SqlServerFamilyDatabaseOps();
    }

    @Bean
    SqlServerSchemaMetadataSupport sqlServerSchemaMetadataSupport() {
        return new SqlServerSchemaMetadataSupport();
    }

    @Bean
    SqlServerDataSourceConnector sqlServerDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new SqlServerDataSourceConnector(jdbc);
    }
}
