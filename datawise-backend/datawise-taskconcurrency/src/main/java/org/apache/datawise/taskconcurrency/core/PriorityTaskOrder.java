package org.apache.datawise.taskconcurrency.core;

import org.apache.datawise.taskconcurrency.model.PendingTask;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/** 任务调度排序：priority 降序（高优先），相同时 enqueueTime 升序（FIFO） */
public final class PriorityTaskOrder
{
    private static final Comparator<PendingTask> COMPARATOR = Comparator
            .comparingInt(PendingTask::getPriority).reversed()
            .thenComparing(PendingTask::getEnqueueTime);

    private PriorityTaskOrder()
    {
    }

    public static List<PendingTask> sort(List<PendingTask> pending)
    {
        return pending.stream().sorted(COMPARATOR).collect(Collectors.toList());
    }
}
