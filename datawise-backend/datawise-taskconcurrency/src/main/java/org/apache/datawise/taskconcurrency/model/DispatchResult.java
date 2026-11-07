package org.apache.datawise.taskconcurrency.model;

import lombok.Builder;
import lombok.Value;

import java.util.List;

/** 单次 dispatch 的调度结果 */
@Value
@Builder
public class DispatchResult
{
    /** 本轮成功分配卡槽的任务租约列表 */
    List<SlotLease> granted;
    /** 因配额/无可用卡槽而跳过的 pending 任务数 */
    int skippedDueToQuota;
}
