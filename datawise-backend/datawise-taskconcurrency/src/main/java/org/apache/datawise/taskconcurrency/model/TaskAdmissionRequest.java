package org.apache.datawise.taskconcurrency.model;

import lombok.Builder;
import lombok.Value;

import java.time.Instant;

/** 任务入池请求 */
@Value
@Builder
public class TaskAdmissionRequest
{
    String taskId;
    int tenantId;
    /** 0–9，数值越大优先级越高 */
    @Builder.Default
    int priority = 5;
    @Builder.Default
    Instant enqueueTime = Instant.now();
}
