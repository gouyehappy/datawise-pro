package org.apache.datawise.taskconcurrency.model;

import lombok.Builder;
import lombok.Value;

import java.time.Instant;

/**
 * 任务池中的任务记录。
 * <p>
 * dispatch 后状态变为 {@link TaskPoolStatus#DISPATCHED} 并保留记录；
 * 仅 {@code ack} 成功后才会从池中物理删除。
 */
@Value
@Builder(toBuilder = true)
public class PendingTask
{
    /** 业务任务唯一标识，如 executionId */
    String taskId;
    int tenantId;
    /** 0–9，越大越优先 */
    int priority;
    /** 入队时间，同优先级 FIFO 依据 */
    Instant enqueueTime;
    @Builder.Default
    TaskPoolStatus status = TaskPoolStatus.PENDING;
    /** 最近一次被调度分配卡槽的时间（DISPATCHED 时有值） */
    Instant dispatchedAt;
}
