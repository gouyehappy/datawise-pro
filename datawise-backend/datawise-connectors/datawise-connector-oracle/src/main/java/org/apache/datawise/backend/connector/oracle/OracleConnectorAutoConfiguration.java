package org.apache.datawise.backend.connector.oracle;

import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.OracleDataSourceConnector;
import org.apache.datawise.backend.connector.oracle.ops.OracleFamilyDatabaseOps;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.oracle.schema.OracleSchemaDialect;
import org.apache.datawise.backend.jdbc.execution.pagination.OracleSqlPaginationDialect;
import org.apache.datawise.backend.schema.introspect.oracle.OracleFamilySchemaMetadataSupport;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "oracle.jdbc.OracleDriver")
public class OracleConnectorAutoConfiguration {

    @Bean
    OracleFamilySchemaMetadataSupport oracleSchemaMetadataSupport() {
        return new OracleFamilySchemaMetadataSupport(DbType.ORACLE::matches);
    }

    @Bean
    OracleSchemaDialect oracleSchemaDialect() {
        return new OracleSchemaDialect();
    }

    @Bean
    OracleFamilyDatabaseOps oracleFamilyDatabaseOps() {
        return new OracleFamilyDatabaseOps();
    }

    @Bean
    OracleSqlPaginationDialect oracleSqlPaginationDialect() {
        return new OracleSqlPaginationDialect();
    }

    @Bean
    OracleDataSourceConnector oracleDataSourceConnector(JdbcConnectorOperations jdbc) {
        return new OracleDataSourceConnector(jdbc);
    }
}
