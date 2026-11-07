package org.apache.datawise.taskconcurrency.api;

import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;

/**
 * 任务并发生命周期监听器（指标、审计、告警等扩展点）。
 */
public interface TaskConcurrencyListener
{
    default void onEnqueued(TaskAdmissionRequest request, boolean accepted)
    {
    }

    default void onDispatched(SlotLease lease)
    {
    }

    default void onAcked(String taskId)
    {
    }

    default void onReclaimed(int count)
    {
    }

    default void onHandlerFailed(String taskId, Throwable error)
    {
    }
}
