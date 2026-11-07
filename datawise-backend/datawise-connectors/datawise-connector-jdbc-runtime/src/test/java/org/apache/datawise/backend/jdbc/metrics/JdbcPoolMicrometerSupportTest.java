package org.apache.datawise.backend.jdbc.metrics;

import com.zaxxer.hikari.HikariConfig;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class JdbcPoolMicrometerSupportTest {

    @Test
    void apply_wiresMicrometerTrackerWhenRegistryPresent() {
        HikariConfig config = new HikariConfig();
        JdbcPoolMicrometerSupport.apply(config, new SimpleMeterRegistry());
        assertNotNull(config.getMetricsTrackerFactory());
    }

    @Test
    void apply_noOpWhenRegistryAbsent() {
        HikariConfig config = new HikariConfig();
        JdbcPoolMicrometerSupport.apply(config, null);
        assertNull(config.getMetricsTrackerFactory());
    }
}
