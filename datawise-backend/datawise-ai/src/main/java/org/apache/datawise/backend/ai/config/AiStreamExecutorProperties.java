package org.apache.datawise.backend.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Bounded pool for AI SSE stream work (chat/analyze/resume).
 * Avoids {@code ForkJoinPool.commonPool()} starvation under blocking LLM I/O.
 */
@ConfigurationProperties(prefix = "datawise.ai.stream.executor")
public class AiStreamExecutorProperties {

    /** Core worker threads. */
    private int corePoolSize = 4;

    /** Max worker threads when the queue is full. */
    private int maxPoolSize = 16;

    /** Bounded queue capacity before rejecting new streams. */
    private int queueCapacity = 64;

    /** Idle thread keep-alive seconds above core size. */
    private int keepAliveSeconds = 60;

    public int getCorePoolSize() {
        return corePoolSize;
    }

    public void setCorePoolSize(int corePoolSize) {
        this.corePoolSize = Math.max(1, corePoolSize);
    }

    public int getMaxPoolSize() {
        return maxPoolSize;
    }

    public void setMaxPoolSize(int maxPoolSize) {
        this.maxPoolSize = Math.max(1, maxPoolSize);
    }

    public int getQueueCapacity() {
        return queueCapacity;
    }

    public void setQueueCapacity(int queueCapacity) {
        this.queueCapacity = Math.max(1, queueCapacity);
    }

    public int getKeepAliveSeconds() {
        return keepAliveSeconds;
    }

    public void setKeepAliveSeconds(int keepAliveSeconds) {
        this.keepAliveSeconds = Math.max(1, keepAliveSeconds);
    }
}
