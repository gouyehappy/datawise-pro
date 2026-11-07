package org.apache.datawise.taskconcurrency.api;

/**
 * 任务执行 SPI：消费者 dispatch 到卡槽后回调此接口执行业务逻辑。
 * <p>
 * 实现方应在成功完成后调用 {@link TaskExecutionContext#ack()}；
 * 执行期间周期调用 {@link TaskExecutionContext#heartbeat()} 以防租约过期。
 */
@FunctionalInterface
public interface TaskHandler
{
    void execute(TaskExecutionContext context) throws Exception;
}
