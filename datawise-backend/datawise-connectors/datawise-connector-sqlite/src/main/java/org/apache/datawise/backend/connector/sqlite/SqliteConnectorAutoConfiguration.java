package org.apache.datawise.backend.connector.sqlite;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.SqliteDataSourceConnector;
import org.apache.datawise.backend.connector.sqlite.dml.SqliteFamilyDmlDialect;
import org.apache.datawise.backend.connector.sqlite.schema.SqliteSchemaDialect;
import org.apache.datawise.backend.connector.sqlite.support.SqliteSchemaMetadataSupport;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "org.sqlite.JDBC")
public class SqliteConnectorAutoConfiguration {

    @Bean
    SqliteSchemaMetadataSupport sqliteSchemaMetadataSupport() {
        return new SqliteSchemaMetadataSupport();
    }

    @Bean
    SqliteSchemaDialect sqliteSchemaDialect() {
        return new SqliteSchemaDialect();
    }

    @Bean
    SqliteFamilyDmlDialect sqliteFamilyDmlDialect() {
        return new SqliteFamilyDmlDialect();
    }

    @Bean
    SqliteDataSourceConnector sqliteDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new SqliteDataSourceConnector(jdbc);
    }
}
