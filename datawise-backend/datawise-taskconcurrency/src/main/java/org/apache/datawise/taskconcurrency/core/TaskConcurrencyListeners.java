package org.apache.datawise.taskconcurrency.core;

import org.apache.datawise.taskconcurrency.api.TaskConcurrencyListener;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collections;
import java.util.List;

/** 监听器广播辅助 */
public final class TaskConcurrencyListeners
{
    private static final Logger log = LoggerFactory.getLogger(TaskConcurrencyListeners.class);

    private final List<TaskConcurrencyListener> listeners;

    public TaskConcurrencyListeners(List<TaskConcurrencyListener> listeners)
    {
        this.listeners = listeners == null ? List.of() : List.copyOf(listeners);
    }

    public static TaskConcurrencyListeners empty()
    {
        return new TaskConcurrencyListeners(Collections.emptyList());
    }

    public void onEnqueued(TaskAdmissionRequest request, boolean accepted)
    {
        for (TaskConcurrencyListener listener : listeners) {
            safe(() -> listener.onEnqueued(request, accepted));
        }
    }

    public void onDispatched(SlotLease lease)
    {
        for (TaskConcurrencyListener listener : listeners) {
            safe(() -> listener.onDispatched(lease));
        }
    }

    public void onAcked(String taskId)
    {
        for (TaskConcurrencyListener listener : listeners) {
            safe(() -> listener.onAcked(taskId));
        }
    }

    public void onReclaimed(int count)
    {
        if (count <= 0) {
            return;
        }
        for (TaskConcurrencyListener listener : listeners) {
            safe(() -> listener.onReclaimed(count));
        }
    }

    public void onHandlerFailed(String taskId, Throwable error)
    {
        for (TaskConcurrencyListener listener : listeners) {
            safe(() -> listener.onHandlerFailed(taskId, error));
        }
    }

    private static void safe(Runnable action)
    {
        try {
            action.run();
        } catch (Exception ex) {
            log.warn("TaskConcurrencyListener callback failed", ex);
        }
    }
}
