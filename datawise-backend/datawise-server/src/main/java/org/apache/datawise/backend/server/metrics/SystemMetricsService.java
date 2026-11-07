package org.apache.datawise.backend.server.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.search.Search;
import org.apache.datawise.backend.common.support.DatawiseMetricsCatalog;
import org.apache.datawise.backend.domain.SystemDatawiseMetricsDto;
import org.apache.datawise.backend.domain.SystemJdbcPoolMetricsDto;
import org.apache.datawise.backend.domain.SystemJvmMetricsDto;
import org.apache.datawise.backend.domain.SystemMetricsDto;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.boot.actuate.health.Status;
import org.springframework.stereotype.Service;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Aggregates Micrometer gauges into a frontend-friendly metrics snapshot. */
@Service
public class SystemMetricsService {

    private static final String HIKARI_CONNECTIONS_PREFIX = "hikaricp.connections.";

    private final ObjectProvider<MeterRegistry> meterRegistryProvider;
    private final ObjectProvider<HealthEndpoint> healthEndpointProvider;

    public SystemMetricsService(
            ObjectProvider<MeterRegistry> meterRegistryProvider,
            ObjectProvider<HealthEndpoint> healthEndpointProvider
    ) {
        this.meterRegistryProvider = meterRegistryProvider;
        this.healthEndpointProvider = healthEndpointProvider;
    }

    public SystemMetricsDto collect() {
        MeterRegistry registry = meterRegistryProvider.getIfAvailable();
        return new SystemMetricsDto(
                Instant.now().toString(),
                resolveHealthStatus(),
                ManagementFactory.getRuntimeMXBean().getUptime(),
                collectJvmMetrics(registry),
                collectDatawiseMetrics(registry),
                collectJdbcPoolMetrics(registry)
        );
    }

    private String resolveHealthStatus() {
        HealthEndpoint healthEndpoint = healthEndpointProvider.getIfAvailable();
        if (healthEndpoint == null) {
            return Status.UP.getCode();
        }
        return healthEndpoint.health().getStatus().getCode();
    }

    private static SystemJvmMetricsDto collectJvmMetrics(MeterRegistry registry) {
        long heapUsed = readMemoryBytes(registry, "jvm.memory.used", "area", "heap");
        long heapMax = readMemoryBytes(registry, "jvm.memory.max", "area", "heap");
        if (heapUsed < 0) {
            heapUsed = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed();
        }
        if (heapMax < 0) {
            heapMax = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getMax();
        }
        Double heapUsagePercent = null;
        if (heapMax > 0) {
            heapUsagePercent = Math.min(100d, (heapUsed * 100d) / heapMax);
        }
        return new SystemJvmMetricsDto(
                Runtime.getRuntime().availableProcessors(),
                heapUsed,
                heapMax,
                heapUsagePercent
        );
    }

    private static SystemDatawiseMetricsDto collectDatawiseMetrics(MeterRegistry registry) {
        return new SystemDatawiseMetricsDto(
                (int) Math.round(readGauge(registry, DatawiseMetricsCatalog.JDBC_POOLS_ACTIVE)),
                (int) Math.round(readGauge(registry, DatawiseMetricsCatalog.EXPLORER_SCHEMA_SESSIONS_ACTIVE)),
                readCounter(registry, DatawiseMetricsCatalog.EXPLORER_LOAD_CHILDREN_NOT_MODIFIED, "shortCircuit", "true"),
                readCounter(registry, DatawiseMetricsCatalog.EXPLORER_LOAD_CHILDREN_NOT_MODIFIED, "shortCircuit", "false"),
                readCounter(registry, DatawiseMetricsCatalog.EXPLORER_LOAD_CHILDREN_MODIFIED)
        );
    }

    private static List<SystemJdbcPoolMetricsDto> collectJdbcPoolMetrics(MeterRegistry registry) {
        if (registry == null) {
            return List.of();
        }
        Map<String, MutablePoolMetrics> pools = new LinkedHashMap<>();
        for (Meter meter : registry.getMeters()) {
            String name = meter.getId().getName();
            if (!name.startsWith(HIKARI_CONNECTIONS_PREFIX)) {
                continue;
            }
            String poolName = meter.getId().getTag("pool");
            if (poolName == null || poolName.isBlank()) {
                continue;
            }
            String metric = name.substring(HIKARI_CONNECTIONS_PREFIX.length());
            MutablePoolMetrics pool = pools.computeIfAbsent(poolName, MutablePoolMetrics::new);
            pool.apply(metric, readNumber(meter));
        }
        return pools.values().stream()
                .map(MutablePoolMetrics::toDto)
                .sorted(Comparator.comparing(SystemJdbcPoolMetricsDto::poolName))
                .toList();
    }

    private static double readGauge(MeterRegistry registry, String name) {
        if (registry == null) {
            return 0;
        }
        Gauge gauge = registry.find(name).gauge();
        return gauge != null ? gauge.value() : 0;
    }

    private static long readCounter(MeterRegistry registry, String name) {
        return readCounter(registry, name, null, null);
    }

    private static long readCounter(MeterRegistry registry, String name, String tagKey, String tagValue) {
        if (registry == null) {
            return 0;
        }
        Search search = registry.find(name);
        if (tagKey != null && tagValue != null) {
            search = search.tag(tagKey, tagValue);
        }
        io.micrometer.core.instrument.Counter counter = search.counter();
        return counter != null ? (long) counter.count() : 0;
    }

    private static long readMemoryBytes(MeterRegistry registry, String name, String tagKey, String tagValue) {
        if (registry == null) {
            return -1;
        }
        Search search = registry.find(name).tag(tagKey, tagValue);
        Gauge gauge = search.gauge();
        if (gauge == null) {
            return -1;
        }
        return Math.round(gauge.value());
    }

    private static Integer readNumber(Meter meter) {
        if (meter instanceof Gauge gauge) {
            return (int) Math.round(gauge.value());
        }
        return null;
    }

    private static final class MutablePoolMetrics {
        private final String poolName;
        private Integer active;
        private Integer idle;
        private Integer pending;
        private Integer max;
        private Integer min;

        private MutablePoolMetrics(String poolName) {
            this.poolName = poolName;
        }

        private void apply(String metric, Integer value) {
            if (value == null) {
                return;
            }
            switch (metric) {
                case "active" -> active = value;
                case "idle" -> idle = value;
                case "pending" -> pending = value;
                case "max" -> max = value;
                case "min" -> min = value;
                default -> {
                }
            }
        }

        private SystemJdbcPoolMetricsDto toDto() {
            String connectionId = poolName.startsWith("dw-") ? poolName.substring(3) : poolName;
            return new SystemJdbcPoolMetricsDto(
                    poolName,
                    connectionId,
                    active,
                    idle,
                    pending,
                    max,
                    min
            );
        }
    }
}
