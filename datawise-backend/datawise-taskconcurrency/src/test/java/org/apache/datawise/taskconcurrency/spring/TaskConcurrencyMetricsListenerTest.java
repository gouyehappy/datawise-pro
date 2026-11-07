package org.apache.datawise.taskconcurrency.spring;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.datawise.taskconcurrency.TaskConcurrencyControllers;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;
import org.apache.datawise.taskconcurrency.store.InMemoryTaskConcurrencyStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TaskConcurrencyMetricsListenerTest
{
    @Test
    void recordsEnqueueAndPoolGauges()
    {
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(4)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(2).build());
        TaskConcurrencyController controller = TaskConcurrencyControllers.create(store);
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ObjectProvider<TaskConcurrencyController> provider = fixedProvider(controller);
        TaskConcurrencyMetricsListener listener = new TaskConcurrencyMetricsListener(
                registry, "datawise.task.concurrency", provider);

        listener.onEnqueued(TaskAdmissionRequest.builder().taskId("t1").tenantId(100).build(), true);
        controller.enqueue(TaskAdmissionRequest.builder().taskId("t1").tenantId(100).build());

        assertEquals(1.0, registry.get("datawise.task.concurrency.enqueue.count")
                .tag("accepted", "true")
                .tag("tenant_id", "100")
                .counter().count());
        assertEquals(1.0, registry.get("datawise.task.concurrency.pool.pending").gauge().value());
    }

    @Test
    void recordsHandlerFailure()
    {
        TaskConcurrencyController controller = TaskConcurrencyControllers.create(
                new InMemoryTaskConcurrencyStore().configureGlobal(2));
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        TaskConcurrencyMetricsListener listener = new TaskConcurrencyMetricsListener(
                registry, "tc", fixedProvider(controller));

        listener.onHandlerFailed("x", new RuntimeException("boom"));

        assertTrue(registry.get("tc.handler.failure.count").counter().count() >= 1.0);
    }

    private static ObjectProvider<TaskConcurrencyController> fixedProvider(TaskConcurrencyController controller)
    {
        return new ObjectProvider<>() {
            @Override
            public TaskConcurrencyController getObject(Object... args)
            {
                return controller;
            }

            @Override
            public TaskConcurrencyController getObject()
            {
                return controller;
            }

            @Override
            public TaskConcurrencyController getIfAvailable()
            {
                return controller;
            }

            @Override
            public TaskConcurrencyController getIfUnique()
            {
                return controller;
            }
        };
    }
}
