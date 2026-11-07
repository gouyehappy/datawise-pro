package org.apache.datawise.backend.lineage.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(LineageProperties.class)
public class LineageAutoConfiguration {
}
