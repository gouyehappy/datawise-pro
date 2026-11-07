package org.apache.datawise.taskconcurrency;

import org.apache.datawise.taskconcurrency.api.InstanceIdentity;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyListener;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyStore;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.core.TaskConcurrencyControllerImpl;
import org.apache.datawise.taskconcurrency.support.DefaultInstanceIdentity;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * 控制器构建器：集中装配 Store、配置、实例标识与监听器。
 */
public final class TaskConcurrencyControllerBuilder
{
    private TaskConcurrencyStore store;
    private InstanceIdentity instanceIdentity = new DefaultInstanceIdentity();
    private TaskConcurrencyProperties properties = TaskConcurrencyProperties.defaults();
    private final List<TaskConcurrencyListener> listeners = new ArrayList<>();

    public TaskConcurrencyControllerBuilder store(TaskConcurrencyStore store)
    {
        this.store = store;
        return this;
    }

    public TaskConcurrencyControllerBuilder instanceIdentity(InstanceIdentity instanceIdentity)
    {
        this.instanceIdentity = instanceIdentity;
        return this;
    }

    public TaskConcurrencyControllerBuilder properties(TaskConcurrencyProperties properties)
    {
        this.properties = properties;
        return this;
    }

    public TaskConcurrencyControllerBuilder addListener(TaskConcurrencyListener listener)
    {
        if (listener != null) {
            listeners.add(listener);
        }
        return this;
    }

    public TaskConcurrencyController build()
    {
        Objects.requireNonNull(store, "store is required");
        Objects.requireNonNull(instanceIdentity, "instanceIdentity is required");
        Objects.requireNonNull(properties, "properties is required");
        return new TaskConcurrencyControllerImpl(store, instanceIdentity, properties, listeners);
    }
}
