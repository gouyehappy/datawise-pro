package org.apache.datawise.taskconcurrency.spring;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Tags;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyListener;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;

import org.springframework.beans.factory.ObjectProvider;

import java.util.Objects;

/**
 * 默认 Micrometer 指标监听器：事件计数 + 池状态 Gauge。
 */
public class TaskConcurrencyMetricsListener implements TaskConcurrencyListener
{
    private final MeterRegistry meterRegistry;
    private final String metricPrefix;
    private final ObjectProvider<TaskConcurrencyController> controllerProvider;

    public TaskConcurrencyMetricsListener(
            MeterRegistry meterRegistry,
            String metricPrefix,
            ObjectProvider<TaskConcurrencyController> controllerProvider)
    {
        this.meterRegistry = Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.metricPrefix = normalizePrefix(metricPrefix);
        this.controllerProvider = Objects.requireNonNull(controllerProvider, "controllerProvider");
        registerPoolGauges();
    }

    @Override
    public void onEnqueued(TaskAdmissionRequest request, boolean accepted)
    {
        increment("enqueue.count", Tags.of(
                "accepted", String.valueOf(accepted),
                "tenant_id", tenantTag(request.getTenantId())));
    }

    @Override
    public void onDispatched(SlotLease lease)
    {
        increment("dispatch.count", Tags.of(
                "tenant_id", tenantTag(lease.getTenantId()),
                "borrowed", String.valueOf(lease.isBorrowed())));
    }

    @Override
    public void onAcked(String taskId)
    {
        increment("ack.count");
    }

    @Override
    public void onReclaimed(int count)
    {
        if (count > 0) {
            meterRegistry.counter(metricPrefix + ".reclaim.count").increment(count);
        }
    }

    @Override
    public void onHandlerFailed(String taskId, Throwable error)
    {
        increment("handler.failure.count");
    }

    private void registerPoolGauges()
    {
        Gauge.builder(metricPrefix + ".pool.pending", controllerProvider, this::globalPending)
                .description("Global pending tasks waiting for dispatch")
                .register(meterRegistry);
        Gauge.builder(metricPrefix + ".pool.dispatched", controllerProvider, this::globalDispatched)
                .description("Global dispatched tasks waiting for ack")
                .register(meterRegistry);
        Gauge.builder(metricPrefix + ".pool.running", controllerProvider, this::globalRunning)
                .description("Global active slot leases")
                .register(meterRegistry);
        Gauge.builder(metricPrefix + ".pool.max", controllerProvider, this::globalMax)
                .description("Global max concurrent slots")
                .register(meterRegistry);
    }

    private double globalPending(ObjectProvider<TaskConcurrencyController> provider)
    {
        TaskConcurrencyController controller = provider.getIfAvailable();
        return controller == null ? 0 : controller.snapshot().getGlobalPending();
    }

    private double globalDispatched(ObjectProvider<TaskConcurrencyController> provider)
    {
        TaskConcurrencyController controller = provider.getIfAvailable();
        return controller == null ? 0 : controller.snapshot().getGlobalDispatched();
    }

    private double globalRunning(ObjectProvider<TaskConcurrencyController> provider)
    {
        TaskConcurrencyController controller = provider.getIfAvailable();
        return controller == null ? 0 : controller.snapshot().getGlobalRunning();
    }

    private double globalMax(ObjectProvider<TaskConcurrencyController> provider)
    {
        TaskConcurrencyController controller = provider.getIfAvailable();
        return controller == null ? 0 : controller.snapshot().getGlobalMaxConcurrent();
    }

    private void increment(String name)
    {
        meterRegistry.counter(metricPrefix + "." + name).increment();
    }

    private void increment(String name, Iterable<Tag> tags)
    {
        meterRegistry.counter(metricPrefix + "." + name, tags).increment();
    }

    private static String normalizePrefix(String prefix)
    {
        if (prefix == null || prefix.isBlank()) {
            return "datawise.task.concurrency";
        }
        return prefix.endsWith(".") ? prefix.substring(0, prefix.length() - 1) : prefix;
    }

    private static String tenantTag(int tenantId)
    {
        return String.valueOf(tenantId);
    }
}
