package org.apache.datawise.taskconcurrency.model;

import lombok.Builder;
import lombok.Value;

/** 全局并发策略：系统级同时运行任务上限 */
@Value
@Builder
public class GlobalSlotPolicy
{
    /** 全局最大并发数，默认 6 */
    @Builder.Default
    int maxConcurrent = 6;
}
