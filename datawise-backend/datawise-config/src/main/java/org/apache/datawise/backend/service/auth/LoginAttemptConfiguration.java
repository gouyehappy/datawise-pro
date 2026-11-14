package org.apache.datawise.backend.service.auth;

import org.apache.datawise.backend.configstore.jdbc.MetadataJdbcConfiguration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class LoginAttemptConfiguration {

    @Bean
    @ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
    public LoginAttemptStore memoryLoginAttemptStore() {
        return new MemoryLoginAttemptStore();
    }

    @Bean
    @ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
    public LoginAttemptStore jdbcLoginAttemptStore(
            @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate metadataJdbc
    ) {
        return new JdbcLoginAttemptStore(metadataJdbc);
    }
}
