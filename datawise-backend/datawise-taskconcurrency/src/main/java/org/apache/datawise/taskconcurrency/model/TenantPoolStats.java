package org.apache.datawise.taskconcurrency.model;

import lombok.Builder;
import lombok.Value;

/** 租户维度的任务池与卡槽统计（snapshot 输出） */
@Value
@Builder
public class TenantPoolStats
{
    int tenantId;
    int allocatedSlots;
    int reservedSlots;
    /** 等待调度（PENDING）任务数 */
    int pendingCount;
    /** 已分配卡槽、等待 ack（DISPATCHED）任务数 */
    int dispatchedCount;
    /** 运行中任务数（含借入，等于租约数） */
    int runningCount;
    /** 运行在自有卡槽上的任务数 */
    int runningOnOwnSlots;
    /** 借入运行数 */
    int borrowedInCount;
    /** 借出运行数 */
    int lentOutCount;
    /** 当前可借出卡槽数 */
    int lendableSlots;
}
