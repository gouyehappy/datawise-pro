package org.apache.datawise.taskconcurrency.spring;

import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Spring Boot 配置绑定（{@code datawise.task-concurrency.*}）。
 */
@ConfigurationProperties(prefix = "datawise.task-concurrency")
public class TaskConcurrencySpringProperties
{
    private boolean enabled = true;
    private StoreType storeType = StoreType.AUTO;
    private int globalMaxConcurrent = TaskConcurrencyProperties.DEFAULT_GLOBAL_MAX_CONCURRENT;
    private Duration leaseTtl = Duration.ofMinutes(30);
    private Duration dispatchInterval = Duration.ofMillis(200);
    private Duration maintenanceInterval = Duration.ofSeconds(30);
    private int dispatchBatchSize = TaskConcurrencyProperties.DEFAULT_DISPATCH_BATCH_SIZE;
    private Duration workerShutdownTimeout = Duration.ofSeconds(60);
    private Duration runtimeShutdownTimeout = Duration.ofSeconds(120);
    private boolean recoverOnStartup = true;
    private boolean runtimeEnabled = true;
    private final Metrics metrics = new Metrics();

    public enum StoreType
    {
        /** 存在 DataSource Bean 时用 JDBC，否则 InMemory */
        AUTO,
        JDBC,
        IN_MEMORY
    }

    public static class Metrics
    {
        private boolean enabled = true;
        private String prefix = "datawise.task.concurrency";

        public boolean isEnabled()
        {
            return enabled;
        }

        public void setEnabled(boolean enabled)
        {
            this.enabled = enabled;
        }

        public String getPrefix()
        {
            return prefix;
        }

        public void setPrefix(String prefix)
        {
            this.prefix = prefix;
        }
    }

    public TaskConcurrencyProperties toRuntimeProperties()
    {
        return TaskConcurrencyProperties.builder()
                .leaseTtl(leaseTtl)
                .dispatchInterval(dispatchInterval)
                .maintenanceInterval(maintenanceInterval)
                .dispatchBatchSize(dispatchBatchSize)
                .workerShutdownTimeout(workerShutdownTimeout)
                .runtimeShutdownTimeout(runtimeShutdownTimeout)
                .recoverOnStartup(recoverOnStartup)
                .build();
    }

    public boolean isEnabled()
    {
        return enabled;
    }

    public void setEnabled(boolean enabled)
    {
        this.enabled = enabled;
    }

    public StoreType getStoreType()
    {
        return storeType;
    }

    public void setStoreType(StoreType storeType)
    {
        this.storeType = storeType;
    }

    public int getGlobalMaxConcurrent()
    {
        return globalMaxConcurrent;
    }

    public void setGlobalMaxConcurrent(int globalMaxConcurrent)
    {
        this.globalMaxConcurrent = globalMaxConcurrent;
    }

    public Duration getLeaseTtl()
    {
        return leaseTtl;
    }

    public void setLeaseTtl(Duration leaseTtl)
    {
        this.leaseTtl = leaseTtl;
    }

    public Duration getDispatchInterval()
    {
        return dispatchInterval;
    }

    public void setDispatchInterval(Duration dispatchInterval)
    {
        this.dispatchInterval = dispatchInterval;
    }

    public Duration getMaintenanceInterval()
    {
        return maintenanceInterval;
    }

    public void setMaintenanceInterval(Duration maintenanceInterval)
    {
        this.maintenanceInterval = maintenanceInterval;
    }

    public int getDispatchBatchSize()
    {
        return dispatchBatchSize;
    }

    public void setDispatchBatchSize(int dispatchBatchSize)
    {
        this.dispatchBatchSize = dispatchBatchSize;
    }

    public Duration getWorkerShutdownTimeout()
    {
        return workerShutdownTimeout;
    }

    public void setWorkerShutdownTimeout(Duration workerShutdownTimeout)
    {
        this.workerShutdownTimeout = workerShutdownTimeout;
    }

    public Duration getRuntimeShutdownTimeout()
    {
        return runtimeShutdownTimeout;
    }

    public void setRuntimeShutdownTimeout(Duration runtimeShutdownTimeout)
    {
        this.runtimeShutdownTimeout = runtimeShutdownTimeout;
    }

    public boolean isRecoverOnStartup()
    {
        return recoverOnStartup;
    }

    public void setRecoverOnStartup(boolean recoverOnStartup)
    {
        this.recoverOnStartup = recoverOnStartup;
    }

    public boolean isRuntimeEnabled()
    {
        return runtimeEnabled;
    }

    public void setRuntimeEnabled(boolean runtimeEnabled)
    {
        this.runtimeEnabled = runtimeEnabled;
    }

    public Metrics getMetrics()
    {
        return metrics;
    }
}
