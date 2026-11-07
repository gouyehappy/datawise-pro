package org.apache.datawise.backend.ai.config;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * Registers AI configuration properties without hard-wiring them on the server Application class.
 * AI beans remain component-scanned via {@code org.apache.datawise.backend} when this module is present.
 */
@AutoConfiguration
@EnableConfigurationProperties({
        AiRagProperties.class,
        AiAnalysisProperties.class,
        AiPythonProperties.class,
        AiDeliveryProperties.class
})
public class AiAutoConfiguration {
}
