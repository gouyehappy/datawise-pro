package org.apache.datawise.taskconcurrency.model;

import lombok.Builder;
import lombok.Value;

import java.util.List;
import java.util.Map;

/** 任务池与卡槽占用快照，供监控与调度决策 */
@Value
@Builder
public class PoolSnapshot
{
    int globalMaxConcurrent;
    /** 当前占用卡槽数（活跃租约数） */
    int globalRunning;
    /** 等待调度（PENDING）任务数 */
    int globalPending;
    /** 已分配卡槽、等待 ack（DISPATCHED）任务数 */
    int globalDispatched;
    Map<Integer, TenantPoolStats> byTenant;
    List<PendingTask> pendingHead;
}
