package org.apache.datawise.taskconcurrency;

import org.apache.datawise.taskconcurrency.api.InstanceIdentity;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyStore;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.support.DefaultInstanceIdentity;

import java.time.Duration;

/**
 * 控制器工厂（快捷入口）；复杂装配请使用 {@link TaskConcurrencyControllerBuilder}。
 */
public final class TaskConcurrencyControllers
{
    private TaskConcurrencyControllers()
    {
    }

    public static TaskConcurrencyControllerBuilder builder()
    {
        return new TaskConcurrencyControllerBuilder();
    }

    public static TaskConcurrencyController create(TaskConcurrencyStore store)
    {
        return builder().store(store).build();
    }

    public static TaskConcurrencyController create(
            TaskConcurrencyStore store, InstanceIdentity identity, Duration leaseTtl)
    {
        return builder()
                .store(store)
                .instanceIdentity(identity)
                .properties(TaskConcurrencyProperties.builder().leaseTtl(leaseTtl).build())
                .build();
    }
}
