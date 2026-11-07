package org.apache.datawise.taskconcurrency;

import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;
import org.apache.datawise.taskconcurrency.store.InMemoryTaskConcurrencyStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 任务并发控制器核心行为单测。
 * <ul>
 *   <li>respectsGlobalMaxConcurrent — 全局上限 6</li>
 *   <li>higherPriorityDispatchedFirst — 优先级调度</li>
 *   <li>borrowedSlotReturnedOnRelease — 借用归还</li>
 *   <li>reservedSlotsLimitLending — reserved 限制借出上限</li>
 * </ul>
 */
class TaskConcurrencyControllerTest
{
    private TaskConcurrencyController controller;

    @BeforeEach
    void setUp()
    {
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(3).reservedSlots(1).build())
                .putTenant(TenantSlotPolicy.builder().tenantId(200).allocatedSlots(3).reservedSlots(0).build());
        controller = TaskConcurrencyControllers.create(store);
    }

    @Test
    void respectsGlobalMaxConcurrent()
    {
        // 8 条任务入池，全局上限 6，应仅调度 6 条
        for (int i = 0; i < 8; i++) {
            controller.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                    .taskId("t" + i)
                    .tenantId(i % 2 == 0 ? 100 : 200)
                    .priority(5)
                    .build());
        }
        assertEquals(6, controller.dispatch(10).getGranted().size());
        assertEquals(6, controller.snapshot().getGlobalRunning());
        assertEquals(2, controller.snapshot().getGlobalPending());
        assertEquals(6, controller.snapshot().getGlobalDispatched());
    }

    @Test
    void higherPriorityDispatchedFirst()
    {
        controller.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("low")
                .tenantId(100)
                .priority(1)
                .build());
        controller.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("high")
                .tenantId(100)
                .priority(9)
                .build());
        var granted = controller.dispatch(1).getGranted();
        assertEquals(1, granted.size());
        assertEquals("high", granted.get(0).getTaskId());
    }

    @Test
    void borrowedSlotReturnedOnRelease()
    {
        // 租户 200 无自有卡槽（allocated=0），必须从 100 借用
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(3).reservedSlots(1).build())
                .putTenant(TenantSlotPolicy.builder().tenantId(200).allocatedSlots(0).build());
        TaskConcurrencyController local = TaskConcurrencyControllers.create(store);

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("b0")
                .tenantId(200)
                .build());
        var granted = local.dispatch(1).getGranted();
        assertEquals(1, granted.size());
        assertTrue(granted.get(0).isBorrowed());
        assertEquals(100, granted.get(0).getSlotOwnerTenantId());
        local.release(granted.get(0).getTaskId());
        assertEquals(0, local.snapshot().getByTenant().get(200).getBorrowedInCount());
    }

    @Test
    void reservedSlotsLimitLending()
    {
        // 100 有 3 槽、1 保留 → 最多借出 2 槽；第 3 次 borrow 应失败
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(3).reservedSlots(1).build())
                .putTenant(TenantSlotPolicy.builder().tenantId(200).allocatedSlots(0).build());
        TaskConcurrencyController local = TaskConcurrencyControllers.create(store);

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("only100")
                .tenantId(200)
                .build());
        var granted = local.dispatch(1).getGranted();
        assertEquals(1, granted.size());
        assertEquals(100, granted.get(0).getSlotOwnerTenantId());
        assertTrue(granted.get(0).isBorrowed());
        // 3 槽 - 1 保留 - 1 已借出 = 1 仍可借
        assertEquals(1, local.snapshot().getByTenant().get(100).getLendableSlots());

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("second")
                .tenantId(200)
                .build());
        assertEquals(1, local.dispatch(1).getGranted().size());
        assertEquals(0, local.snapshot().getByTenant().get(100).getLendableSlots());

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("third")
                .tenantId(200)
                .build());
        assertEquals(0, local.dispatch(1).getGranted().size());
    }

    @Test
    void dispatchKeepsTaskInPoolUntilAck()
    {
        controller.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("ack-me")
                .tenantId(100)
                .build());
        controller.dispatch(1);
        assertEquals(1, controller.snapshot().getGlobalDispatched());
        assertEquals(0, controller.snapshot().getGlobalPending());
        assertTrue(controller.findLease("ack-me").isPresent());

        controller.ack("ack-me");
        assertEquals(0, controller.snapshot().getGlobalDispatched());
        assertTrue(controller.findLease("ack-me").isEmpty());
    }

    @Test
    void expiredLeaseRequeuesTaskForRecovery() throws InterruptedException
    {
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(2).build());
        TaskConcurrencyController local = TaskConcurrencyControllers.create(
                store, new org.apache.datawise.taskconcurrency.support.DefaultInstanceIdentity(),
                Duration.ofMillis(80));

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("crash-task")
                .tenantId(100)
                .build());
        local.dispatch(1);
        assertEquals(1, local.snapshot().getGlobalDispatched());

        Thread.sleep(150);
        assertEquals(1, local.reclaimExpiredLeases());
        assertEquals(0, local.snapshot().getGlobalDispatched());
        assertEquals(1, local.snapshot().getGlobalPending());

        var granted = local.dispatch(1).getGranted();
        assertEquals(1, granted.size());
        assertEquals("crash-task", granted.get(0).getTaskId());
        local.ack("crash-task");
    }

    @Test
    void pendingTasksBlockLendingToOtherTenants()
    {
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(2).reservedSlots(0).build())
                .putTenant(TenantSlotPolicy.builder().tenantId(200).allocatedSlots(0).build());
        TaskConcurrencyController local = TaskConcurrencyControllers.create(store);

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("a1").tenantId(100).build());
        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("a2").tenantId(100).build());
        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("b1").tenantId(200).build());

        var granted = local.dispatch(10).getGranted();
        assertEquals(2, granted.size());
        assertTrue(granted.stream().allMatch(l -> l.getTenantId() == 100));
        assertEquals(1, local.snapshot().getGlobalPending());
        assertEquals(0, local.snapshot().getByTenant().get(100).getLendableSlots());
    }

    @Test
    void canLendWhenTenantHasNoPendingTasks()
    {
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(2).reservedSlots(0).build())
                .putTenant(TenantSlotPolicy.builder().tenantId(200).allocatedSlots(0).build());
        TaskConcurrencyController local = TaskConcurrencyControllers.create(store);

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("only200").tenantId(200).build());
        var granted = local.dispatch(1).getGranted();
        assertEquals(1, granted.size());
        assertTrue(granted.get(0).isBorrowed());
        assertEquals(100, granted.get(0).getSlotOwnerTenantId());
    }

    @Test
    void canIncreaseTenantSlotsDynamically()
    {
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(1).build());
        TaskConcurrencyController local = TaskConcurrencyControllers.create(store);

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("t1").tenantId(100).build());
        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("t2").tenantId(100).build());
        assertEquals(1, local.dispatch(2).getGranted().size());

        local.upsertTenantPolicy(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(3).build());
        assertEquals(3, local.getTenantPolicy(100).orElseThrow().getAllocatedSlots());

        assertEquals(1, local.dispatch(2).getGranted().size());
        assertEquals(2, local.snapshot().getGlobalRunning());
    }

    @Test
    void cannotReduceAllocatedBelowInUse()
    {
        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(2).build());
        TaskConcurrencyController local = TaskConcurrencyControllers.create(store);

        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("t1").tenantId(100).build());
        local.enqueue(org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest.builder()
                .taskId("t2").tenantId(100).build());
        local.dispatch(2);

        org.junit.jupiter.api.Assertions.assertThrows(
                org.apache.datawise.taskconcurrency.exception.PolicyValidationException.class, () ->
                local.upsertTenantPolicy(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(1).build()));
    }

    @Test
    void canUpdateGlobalMaxConcurrent()
    {
        controller.updateGlobalMaxConcurrent(8);
        assertEquals(8, controller.snapshot().getGlobalMaxConcurrent());
    }
}
