package org.apache.datawise.taskconcurrency.runtime;

import org.apache.datawise.taskconcurrency.TaskConcurrencyControllers;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;
import org.apache.datawise.taskconcurrency.store.InMemoryTaskConcurrencyStore;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TaskConcurrencyRuntimeTest
{
    @Test
    void runtimeDispatchesAndAcksViaHandler() throws Exception
    {
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(4)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(2).build());
        TaskConcurrencyController controller = TaskConcurrencyControllers.create(store);

        AtomicInteger executed = new AtomicInteger();
        TaskConcurrencyProperties props = TaskConcurrencyProperties.builder()
                .dispatchInterval(Duration.ofMillis(50))
                .maintenanceInterval(Duration.ofSeconds(60))
                .dispatchBatchSize(4)
                .recoverOnStartup(false)
                .build();

        try (TaskConcurrencyRuntime runtime = TaskConcurrencyRuntime.create(controller, ctx -> {
            executed.incrementAndGet();
            ctx.ack();
        }, props)) {
            runtime.start();
            controller.enqueue(TaskAdmissionRequest.builder().taskId("r1").tenantId(100).build());
            Thread.sleep(500);
        }

        assertTrue(executed.get() >= 1);
        assertEquals(0, controller.snapshot().getGlobalDispatched());
    }
}
