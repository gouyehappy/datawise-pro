package org.apache.datawise.taskconcurrency.demo;

import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.model.PoolSnapshot;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Random;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 任务生产者：持续向任务池 {@link TaskConcurrencyController#enqueue} 投递任务。
 */
public final class TaskProducer implements Runnable
{
    private static final Logger log = LoggerFactory.getLogger(TaskProducer.class);

    private final TaskConcurrencyController controller;
    private final AtomicBoolean running;
    private final AtomicInteger taskSeq = new AtomicInteger();
    private final Random random;
    private final int[] tenantIds;

    public TaskProducer(
            TaskConcurrencyController controller,
            AtomicBoolean running,
            int[] tenantIds,
            long randomSeed)
    {
        this.controller = controller;
        this.running = running;
        this.tenantIds = tenantIds;
        this.random = new Random(randomSeed);
    }

    @Override
    public void run()
    {
        while (running.get()) {
            produceOne();
            sleepMs(1500 + random.nextInt(1000));
        }
        log.info("[生产者] 已停止");
    }

    /** 生产一条任务并入池 */
    public void produceOne()
    {
        int tenantId = tenantIds[taskSeq.get() % tenantIds.length];
        int priority = 1 + random.nextInt(9);
        String taskId = "task-" + tenantId + "-" + taskSeq.incrementAndGet();

        controller.enqueue(TaskAdmissionRequest.builder()
                .taskId(taskId)
                .tenantId(tenantId)
                .priority(priority)
                .build());

        PoolSnapshot snap = controller.snapshot();
        log.info("[生产者] 入池 taskId={} tenant={} priority={} | pending={} dispatched={} running={}/{}",
                taskId, tenantId, priority,
                snap.getGlobalPending(), snap.getGlobalDispatched(),
                snap.getGlobalRunning(), snap.getGlobalMaxConcurrent());
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
