package org.apache.datawise.backend.sse;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.util.UUID;

/**
 * Auto-configures {@link SseEventBus}: default in-memory; optional JDBC polling bridge.
 */
@AutoConfiguration
@EnableConfigurationProperties(SseProperties.class)
public class SseEventBusAutoConfiguration {

    /** Same bean name as {@code MetadataJdbcConfiguration#METADATA_DATA_SOURCE}. */
    public static final String METADATA_DATA_SOURCE = "metadataDataSource";

    @Bean(destroyMethod = "close")
    @ConditionalOnMissingBean(SseEventBus.class)
    public SseEventBus sseEventBus(
                                   SseProperties properties,
                                   Environment environment,
                                   ApplicationContext applicationContext) {
        String instanceId = resolveInstanceId(properties, environment);
        if (properties.getBusType() == SseProperties.BusType.JDBC) {
            if (!applicationContext.containsBean(METADATA_DATA_SOURCE)) {
                throw new IllegalStateException(
                        "datawise.sse.bus-type=jdbc requires metadataDataSource "
                                + "(set datawise.storage.backend=jdbc)");
            }
            DataSource dataSource = applicationContext.getBean(METADATA_DATA_SOURCE, DataSource.class);
            return new JdbcPollingSseEventBus(
                    dataSource,
                    instanceId,
                    properties.getJdbc().getPollInterval(),
                    properties.getJdbc().getRetention());
        }
        return new InMemorySseEventBus(instanceId);
    }

    static String resolveInstanceId(SseProperties properties, Environment environment) {
        if (properties.getInstanceId() != null && !properties.getInstanceId().isBlank()) {
            return properties.getInstanceId().trim();
        }
        String appName = environment.getProperty("spring.application.name", "datawise");
        return appName + "@" + resolveHostPid();
    }

    private static String resolveHostPid() {
        try {
            String host = InetAddress.getLocalHost().getHostName();
            String pid = ManagementFactory.getRuntimeMXBean().getName();
            return host + ":" + pid;
        } catch (Exception ex) {
            return UUID.randomUUID().toString();
        }
    }
}
