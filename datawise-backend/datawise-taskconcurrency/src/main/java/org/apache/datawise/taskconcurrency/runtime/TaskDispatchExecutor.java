package org.apache.datawise.taskconcurrency.runtime;

import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.apache.datawise.taskconcurrency.api.TaskHandler;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.core.TaskConcurrencyListeners;
import org.apache.datawise.taskconcurrency.model.DispatchResult;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 生产级任务消费者：dispatch 取任务 → 有界线程池执行 {@link TaskHandler} → 失败不 ack（由租约回收重试）。
 */
public final class TaskDispatchExecutor implements AutoCloseable
{
    private static final Logger log = LoggerFactory.getLogger(TaskDispatchExecutor.class);

    private final TaskConcurrencyController controller;
    private final TaskHandler handler;
    private final TaskConcurrencyProperties properties;
    private final TaskConcurrencyListeners listeners;
    private final ExecutorService workers;

    public TaskDispatchExecutor(
            TaskConcurrencyController controller,
            TaskHandler handler,
            TaskConcurrencyProperties properties,
            TaskConcurrencyListeners listeners)
    {
        this.controller = controller;
        this.handler = handler;
        this.properties = properties;
        this.listeners = listeners;
        int poolSize = Math.max(1, properties.getWorkerPoolSize());
        this.workers = new ThreadPoolExecutor(
                poolSize,
                poolSize,
                60L,
                TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(Math.max(poolSize * 4, 16)),
                new NamedThreadFactory("tc-worker"),
                new ThreadPoolExecutor.AbortPolicy());
        log.info("Task dispatch executor ready workers={} queue={}", poolSize, Math.max(poolSize * 4, 16));
    }

    /** 单次调度周期：分配卡槽并异步执行 */
    public DispatchResult dispatchOnce()
    {
        DispatchResult result = controller.dispatch(properties.getDispatchBatchSize());
        for (SlotLease lease : result.getGranted()) {
            submitExecution(lease);
        }
        return result;
    }

    private void submitExecution(SlotLease lease)
    {
        if (workers.isShutdown()) {
            return;
        }
        try {
            workers.submit(() -> runHandler(lease));
        } catch (RejectedExecutionException ex) {
            log.warn("Worker pool rejected taskId={}", lease.getTaskId());
        }
    }

    private void runHandler(SlotLease lease)
    {
        TaskExecutionContext ctx = TaskExecutionContext.builder()
                .taskId(lease.getTaskId())
                .tenantId(lease.getTenantId())
                .priority(lease.getPriority())
                .lease(lease)
                .controller(controller)
                .build();
        try {
            handler.execute(ctx);
        } catch (Exception ex) {
            log.error("Task handler failed, taskId={} will be reclaimed on lease timeout", lease.getTaskId(), ex);
            listeners.onHandlerFailed(lease.getTaskId(), ex);
        }
    }

    @Override
    public void close() throws InterruptedException
    {
        workers.shutdown();
        if (!workers.awaitTermination(properties.getWorkerShutdownTimeout().toMillis(), TimeUnit.MILLISECONDS)) {
            workers.shutdownNow();
        }
    }

    private static final class NamedThreadFactory implements ThreadFactory
    {
        private final AtomicInteger seq = new AtomicInteger();
        private final String prefix;

        private NamedThreadFactory(String prefix)
        {
            this.prefix = prefix;
        }

        @Override
        public Thread newThread(Runnable r)
        {
            Thread t = new Thread(r, prefix + "-" + seq.incrementAndGet());
            t.setDaemon(true);
            return t;
        }
    }
}
