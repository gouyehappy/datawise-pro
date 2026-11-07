package org.apache.datawise.backend.server.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.datawise.backend.common.support.DatawiseMetricsCatalog;
import org.apache.datawise.backend.domain.SystemMetricsDto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SystemMetricsServiceTest {

    @Test
    void collect_readsDatawiseGaugesAndHeap() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        AtomicInteger pools = new AtomicInteger(2);
        AtomicInteger sessions = new AtomicInteger(3);
        Gauge.builder(DatawiseMetricsCatalog.JDBC_POOLS_ACTIVE, pools, AtomicInteger::get).register(registry);
        Gauge.builder(DatawiseMetricsCatalog.EXPLORER_SCHEMA_SESSIONS_ACTIVE, sessions, AtomicInteger::get)
                .register(registry);

        @SuppressWarnings("unchecked")
        ObjectProvider<MeterRegistry> registryProvider = mock(ObjectProvider.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<org.springframework.boot.actuate.health.HealthEndpoint> healthProvider =
                mock(ObjectProvider.class);
        when(registryProvider.getIfAvailable()).thenReturn(registry);
        when(healthProvider.getIfAvailable()).thenReturn(null);

        SystemMetricsService service = new SystemMetricsService(registryProvider, healthProvider);
        SystemMetricsDto metrics = service.collect();

        assertEquals(2, metrics.datawise().jdbcPoolsActive());
        assertEquals(3, metrics.datawise().explorerSchemaSessionsActive());
        assertEquals("UP", metrics.healthStatus());
    }
}
