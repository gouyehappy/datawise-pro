package org.apache.datawise.taskconcurrency.api;

import org.apache.datawise.taskconcurrency.model.SlotLease;

import lombok.Builder;
import lombok.Value;

/**
 * 单次任务执行上下文，封装租约信息与 ack/heartbeat 操作。
 */
@Value
@Builder
public class TaskExecutionContext
{
    String taskId;
    int tenantId;
    int priority;
    SlotLease lease;
    TaskConcurrencyController controller;

    public void heartbeat()
    {
        controller.heartbeat(taskId);
    }

    public void ack()
    {
        controller.ack(taskId);
    }

    public boolean borrowed()
    {
        return lease.isBorrowed();
    }

    public int slotOwnerTenantId()
    {
        return lease.getSlotOwnerTenantId();
    }
}
