package org.apache.datawise.backend.ai.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Configuration
@EnableConfigurationProperties(AiStreamExecutorProperties.class)
@ConditionalOnProperty(prefix = "datawise.ai.stream.executor", name = "enabled", havingValue = "true", matchIfMissing = true)
public class AiStreamExecutorConfiguration {

    public static final String AI_STREAM_EXECUTOR = "aiStreamExecutor";

    private static final Logger log = LoggerFactory.getLogger(AiStreamExecutorConfiguration.class);

    @Bean(name = AI_STREAM_EXECUTOR, destroyMethod = "shutdown")
    @Qualifier(AI_STREAM_EXECUTOR)
    ThreadPoolExecutor aiStreamExecutor(AiStreamExecutorProperties properties) {
        int core = properties.getCorePoolSize();
        int max = Math.max(core, properties.getMaxPoolSize());
        ThreadPoolExecutor executor = new ThreadPoolExecutor(
                core,
                max,
                properties.getKeepAliveSeconds(),
                TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(properties.getQueueCapacity()),
                new NamedThreadFactory("ai-stream"),
                (runnable, pool) -> {
                    log.warn(
                            "AI stream executor saturated (active={} queue={} size={}); rejecting new SSE work",
                            pool.getActiveCount(),
                            pool.getQueue().size(),
                            pool.getPoolSize());
                    throw new RejectedExecutionException("AI stream executor saturated");
                }
        );
        log.info(
                "AI stream executor ready core={} max={} queue={}",
                core,
                max,
                properties.getQueueCapacity());
        return executor;
    }

    private static final class NamedThreadFactory implements ThreadFactory {
        private final AtomicInteger seq = new AtomicInteger();
        private final String prefix;

        private NamedThreadFactory(String prefix) {
            this.prefix = prefix;
        }

        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, prefix + "-" + seq.incrementAndGet());
            t.setDaemon(true);
            return t;
        }
    }
}
