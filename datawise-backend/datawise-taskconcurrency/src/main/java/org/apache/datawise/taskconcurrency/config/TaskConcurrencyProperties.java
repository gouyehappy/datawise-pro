package org.apache.datawise.taskconcurrency.config;

import lombok.Builder;
import lombok.Value;

import java.time.Duration;

/**
 * 任务并发控制器运行时配置（可通过 Builder 覆盖默认值）。
 */
@Value
@Builder(toBuilder = true)
public class TaskConcurrencyProperties
{
    public static final int DEFAULT_GLOBAL_MAX_CONCURRENT = 6;
    public static final int MIN_PRIORITY = 0;
    public static final int MAX_PRIORITY = 9;
    public static final int DEFAULT_DISPATCH_BATCH_SIZE = 10;

    @Builder.Default
    Duration leaseTtl = Duration.ofMinutes(30);

    @Builder.Default
    Duration dispatchInterval = Duration.ofMillis(200);

    @Builder.Default
    Duration maintenanceInterval = Duration.ofSeconds(30);

    @Builder.Default
    int dispatchBatchSize = DEFAULT_DISPATCH_BATCH_SIZE;

    @Builder.Default
    Duration workerShutdownTimeout = Duration.ofSeconds(60);

    @Builder.Default
    Duration runtimeShutdownTimeout = Duration.ofSeconds(120);

    @Builder.Default
    boolean recoverOnStartup = true;

    public static TaskConcurrencyProperties defaults()
    {
        return TaskConcurrencyProperties.builder().build();
    }
}
