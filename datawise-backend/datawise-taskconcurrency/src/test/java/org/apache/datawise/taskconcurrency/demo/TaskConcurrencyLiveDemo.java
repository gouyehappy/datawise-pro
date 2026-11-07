package org.apache.datawise.taskconcurrency.demo;

import org.apache.datawise.taskconcurrency.TaskConcurrencyControllerBuilder;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.model.PoolSnapshot;
import org.apache.datawise.taskconcurrency.model.TenantPoolStats;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;
import org.apache.datawise.taskconcurrency.runtime.TaskConcurrencyRuntime;
import org.apache.datawise.taskconcurrency.store.InMemoryTaskConcurrencyStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Live Demo：{@link TaskProducer} + 生产级 {@link TaskConcurrencyRuntime} 消费者。
 */
public final class TaskConcurrencyLiveDemo
{
    private static final Logger log = LoggerFactory.getLogger(TaskConcurrencyLiveDemo.class);
    private static final int[] TENANTS = {100, 200, 300};
    private static final Random RANDOM = new Random(42);

    private final AtomicBoolean running = new AtomicBoolean(true);
    private Thread producerThread;
    private Thread monitorThread;

    public static void main(String[] args) throws Exception
    {
        int seconds = args.length > 0 ? Integer.parseInt(args[0]) : 60;

        InMemoryTaskConcurrencyStore store = new InMemoryTaskConcurrencyStore()
                .configureGlobal(6)
                .putTenant(TenantSlotPolicy.builder().tenantId(100).allocatedSlots(2).reservedSlots(1).build())
                .putTenant(TenantSlotPolicy.builder().tenantId(200).allocatedSlots(2).reservedSlots(0).build())
                .putTenant(TenantSlotPolicy.builder().tenantId(300).allocatedSlots(0).build());

        TaskConcurrencyProperties props = TaskConcurrencyProperties.builder()
                .leaseTtl(Duration.ofSeconds(120))
                .dispatchInterval(Duration.ofMillis(200))
                .maintenanceInterval(Duration.ofSeconds(3))
                .dispatchBatchSize(4)
                .recoverOnStartup(true)
                .build();

        TaskConcurrencyController controller = new TaskConcurrencyControllerBuilder()
                .store(store)
                .properties(props)
                .build();

        TaskConcurrencyLiveDemo demo = new TaskConcurrencyLiveDemo();

        log.info("========== 任务并发 Live Demo（{} 秒）==========", seconds);
        log.info("架构: TaskProducer → enqueue | TaskConcurrencyRuntime → dispatch + TaskHandler → ack");

        try (TaskConcurrencyRuntime runtime = TaskConcurrencyRuntime.create(controller, demo::handleTask, props)) {
            runtime.start();
            demo.startAuxThreads(controller);
            Thread.sleep(Duration.ofSeconds(seconds).toMillis());
            demo.shutdown();
        }

        PoolSnapshot snap = controller.snapshot();
        log.info("========== Demo 结束 | pending={} dispatched={} running={} ==========",
                snap.getGlobalPending(), snap.getGlobalDispatched(), snap.getGlobalRunning());
    }

    void startAuxThreads(TaskConcurrencyController controller)
    {
        TaskProducer producer = new TaskProducer(controller, running, TENANTS, 42);
        producerThread = new Thread(producer, "task-producer");
        monitorThread = new Thread(() -> monitorLoop(controller), "monitor");
        producerThread.setDaemon(true);
        monitorThread.setDaemon(true);
        producerThread.start();
        monitorThread.start();
    }

    void shutdown() throws InterruptedException
    {
        running.set(false);
        if (producerThread != null) {
            producerThread.join(5_000);
        }
        if (monitorThread != null) {
            monitorThread.join(3_000);
        }
    }

    /** 演示用 TaskHandler：模拟 8–15 秒任务并周期心跳 */
    void handleTask(TaskExecutionContext ctx) throws InterruptedException
    {
        long execMs = 8_000L + RANDOM.nextInt(7_000);
        log.info("[消费者] 开始 taskId={} tenant={} borrowed={} 预计{}s",
                ctx.getTaskId(), ctx.getTenantId(), ctx.borrowed(), execMs / 1000);

        long elapsed = 0;
        while (elapsed < execMs) {
            Thread.sleep(Math.min(2_000, execMs - elapsed));
            elapsed += Math.min(2_000, execMs - elapsed);
            ctx.heartbeat();
            log.info("[消费者] 执行中 taskId={} {}/{}s", ctx.getTaskId(), elapsed / 1000, execMs / 1000);
        }
        ctx.ack();
        log.info("[消费者] ACK taskId={}", ctx.getTaskId());
    }

    private void monitorLoop(TaskConcurrencyController controller)
    {
        while (running.get()) {
            sleepMs(2_000);
            printSnapshot(controller.snapshot());
        }
    }

    static void printSnapshot(PoolSnapshot snap)
    {
        StringBuilder sb = new StringBuilder();
        sb.append(String.format("[池快照] pending=%d dispatched=%d running=%d/%d | ",
                snap.getGlobalPending(), snap.getGlobalDispatched(),
                snap.getGlobalRunning(), snap.getGlobalMaxConcurrent()));
        for (Map.Entry<Integer, TenantPoolStats> e : snap.getByTenant().entrySet()) {
            TenantPoolStats s = e.getValue();
            sb.append(String.format("T%d[p=%d,d=%d,r=%d,可借=%d] ",
                    s.getTenantId(), s.getPendingCount(), s.getDispatchedCount(),
                    s.getRunningCount(), s.getLendableSlots()));
        }
        log.info(sb.toString());
    }

    private static void sleepMs(long ms)
    {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
