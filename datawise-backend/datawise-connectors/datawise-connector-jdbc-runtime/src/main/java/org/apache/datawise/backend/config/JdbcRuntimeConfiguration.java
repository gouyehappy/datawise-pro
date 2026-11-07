package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
        JdbcPoolProperties.class,
        JdbcDriverMavenProperties.class,
})
public class JdbcRuntimeConfiguration {
}
