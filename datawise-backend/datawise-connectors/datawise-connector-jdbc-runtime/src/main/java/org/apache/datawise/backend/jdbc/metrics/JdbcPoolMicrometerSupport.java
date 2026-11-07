package org.apache.datawise.backend.jdbc.metrics;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.metrics.micrometer.MicrometerMetricsTrackerFactory;
import io.micrometer.core.instrument.MeterRegistry;

/** Wires HikariCP pool metrics into Micrometer when a registry is available. */
public final class JdbcPoolMicrometerSupport {

    private JdbcPoolMicrometerSupport() {
    }

    public static void apply(HikariConfig config, MeterRegistry meterRegistry) {
        if (meterRegistry == null || config == null) {
            return;
        }
        config.setRegisterMbeans(true);
        config.setMetricsTrackerFactory(new MicrometerMetricsTrackerFactory(meterRegistry));
    }
}
