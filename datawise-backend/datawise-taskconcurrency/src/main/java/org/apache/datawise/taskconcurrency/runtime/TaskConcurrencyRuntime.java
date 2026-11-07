package org.apache.datawise.taskconcurrency.runtime;

import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskHandler;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.core.TaskConcurrencyListeners;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 任务并发运行时：管理调度循环、租约维护与优雅停机。
 * <p>
 * 典型用法：
 * <pre>
 * try (TaskConcurrencyRuntime runtime = TaskConcurrencyRuntime.create(controller, handler, props)) {
 *     runtime.start();
 *     // 业务侧 enqueue 任务
 * }
 * </pre>
 */
public final class TaskConcurrencyRuntime implements AutoCloseable
{
    private static final Logger log = LoggerFactory.getLogger(TaskConcurrencyRuntime.class);

    private final TaskConcurrencyController controller;
    private final TaskHandler handler;
    private final TaskConcurrencyProperties properties;
    private final TaskConcurrencyListeners listeners;
    private final TaskDispatchExecutor dispatchExecutor;
    private final ScheduledExecutorService scheduler;
    private final AtomicBoolean started = new AtomicBoolean(false);

    private ScheduledFuture<?> dispatchFuture;
    private ScheduledFuture<?> maintenanceFuture;

    private TaskConcurrencyRuntime(
            TaskConcurrencyController controller,
            TaskHandler handler,
            TaskConcurrencyProperties properties,
            TaskConcurrencyListeners listeners)
    {
        this.controller = controller;
        this.handler = handler;
        this.properties = properties;
        this.listeners = listeners;
        this.dispatchExecutor = new TaskDispatchExecutor(controller, handler, properties, listeners);
        this.scheduler = Executors.newScheduledThreadPool(2, new NamedThreadFactory("tc-scheduler"));
    }

    public static TaskConcurrencyRuntime create(
            TaskConcurrencyController controller,
            TaskHandler handler,
            TaskConcurrencyProperties properties)
    {
        return create(controller, handler, properties, TaskConcurrencyListeners.empty());
    }

    public static TaskConcurrencyRuntime create(
            TaskConcurrencyController controller,
            TaskHandler handler,
            TaskConcurrencyProperties properties,
            TaskConcurrencyListeners listeners)
    {
        Objects.requireNonNull(controller, "controller");
        Objects.requireNonNull(handler, "handler");
        Objects.requireNonNull(properties, "properties");
        return new TaskConcurrencyRuntime(
                controller,
                handler,
                properties,
                listeners == null ? TaskConcurrencyListeners.empty() : listeners);
    }

    public void start()
    {
        if (!started.compareAndSet(false, true)) {
            return;
        }
        if (properties.isRecoverOnStartup()) {
            int recovered = controller.recoverOnStartup();
            if (recovered > 0) {
                log.info("Recovered {} tasks on startup", recovered);
                listeners.onReclaimed(recovered);
            }
        }

        long dispatchMs = Math.max(50, properties.getDispatchInterval().toMillis());
        long maintenanceMs = Math.max(1_000, properties.getMaintenanceInterval().toMillis());

        dispatchFuture = scheduler.scheduleWithFixedDelay(
                () -> safeRun(dispatchExecutor::dispatchOnce),
                0, dispatchMs, TimeUnit.MILLISECONDS);

        maintenanceFuture = scheduler.scheduleWithFixedDelay(
                () -> safeRun(this::reclaimOnce),
                maintenanceMs, maintenanceMs, TimeUnit.MILLISECONDS);

        log.info("TaskConcurrencyRuntime started (dispatch={}ms, maintenance={}ms)",
                dispatchMs, maintenanceMs);
    }

    public boolean isStarted()
    {
        return started.get();
    }

    private void reclaimOnce()
    {
        int reclaimed = controller.reclaimExpiredLeases();
        if (reclaimed > 0) {
            log.warn("Reclaimed {} expired leases", reclaimed);
            listeners.onReclaimed(reclaimed);
        }
    }

    @Override
    public void close()
    {
        if (!started.get()) {
            return;
        }
        cancelQuietly(dispatchFuture);
        cancelQuietly(maintenanceFuture);
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(properties.getRuntimeShutdownTimeout().toMillis(), TimeUnit.MILLISECONDS)) {
                scheduler.shutdownNow();
            }
            dispatchExecutor.close();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            scheduler.shutdownNow();
        }
        log.info("TaskConcurrencyRuntime stopped");
    }

    public TaskConcurrencyController controller()
    {
        return controller;
    }

    private static void cancelQuietly(ScheduledFuture<?> future)
    {
        if (future != null) {
            future.cancel(false);
        }
    }

    private static void safeRun(Runnable action)
    {
        try {
            action.run();
        } catch (Exception ex) {
            log.error("Scheduled task failed", ex);
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
