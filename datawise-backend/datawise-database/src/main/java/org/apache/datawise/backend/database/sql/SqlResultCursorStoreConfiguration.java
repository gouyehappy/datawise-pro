package org.apache.datawise.backend.database.sql;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.jdbc.MetadataJdbcConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class SqlResultCursorStoreConfiguration {

    @Bean
    @ConditionalOnProperty(
            prefix = "datawise.query",
            name = "cursor-store-type",
            havingValue = "in-memory",
            matchIfMissing = true
    )
    public SqlResultCursorStore memorySqlResultCursorStore() {
        return new MemorySqlResultCursorStore();
    }

    @Bean
    @ConditionalOnProperty(prefix = "datawise.query", name = "cursor-store-type", havingValue = "jdbc")
    public SqlResultCursorStore jdbcSqlResultCursorStore(
            @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate metadataJdbc,
            @Autowired(required = false) ObjectMapper objectMapper
    ) {
        return new JdbcSqlResultCursorStore(metadataJdbc, objectMapper);
    }
}
