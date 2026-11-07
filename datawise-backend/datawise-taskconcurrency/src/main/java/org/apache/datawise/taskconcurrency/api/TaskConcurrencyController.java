package org.apache.datawise.taskconcurrency.api;

import org.apache.datawise.taskconcurrency.model.GlobalSlotPolicy;
import org.apache.datawise.taskconcurrency.model.DispatchResult;
import org.apache.datawise.taskconcurrency.model.PoolSnapshot;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;

import java.util.Map;
import java.util.Optional;

/**
 * 任务并发总控：全局上限 + 租户配额 + 卡槽借用 + 优先级调度 + ACK 确认。
 * <p>
 * 典型集成流程：
 * <ol>
 *   <li>{@link #enqueue(TaskAdmissionRequest)} — 任务入池（PENDING）</li>
 *   <li>{@link #dispatch(int)} — 分配卡槽，任务变为 DISPATCHED（仍保留在池中）</li>
 *   <li>执行业务逻辑，长任务周期调用 {@link #heartbeat(String)}</li>
 *   <li>{@link #ack(String)} — 执行成功确认，从任务池删除并释放卡槽</li>
 * </ol>
 * 宕机恢复：租约心跳超时后 {@link #reclaimExpiredLeases()} 将任务重新置为 PENDING 可被再次调度。
 */
public interface TaskConcurrencyController
{
    void enqueue(TaskAdmissionRequest request);

    /** 取消尚未调度的 PENDING 任务 */
    void cancelPending(String taskId);

    DispatchResult dispatch(int maxBatch);

    /**
     * 执行成功 ACK：从任务池删除任务并释放卡槽。
     * 未 ack 前任务始终以 DISPATCHED 状态保留，便于宕机后恢复。
     */
    void ack(String taskId);

    /** {@link #ack(String)} 的别名，语义相同 */
    void release(String taskId);

    /** 执行中续期租约心跳，避免长任务被 reclaim 误判 */
    void heartbeat(String taskId);

    Optional<SlotLease> findLease(String taskId);

    PoolSnapshot snapshot();

    /** 回收僵死租约并将任务重新入队（PENDING） */
    int reclaimExpiredLeases();

    /** 启动时调用：修复孤儿 DISPATCHED + 回收过期租约 */
    int recoverOnStartup();

    /**
     * 动态调整租户卡槽配额（allocated / reserved / maxConcurrent / enabled）。
     * 缩容时 allocated 不得小于当前属主卡槽占用数，maxConcurrent 不得小于当前运行数。
     */
    void upsertTenantPolicy(TenantSlotPolicy policy);

    Optional<TenantSlotPolicy> getTenantPolicy(int tenantId);

    Map<Integer, TenantSlotPolicy> listTenantPolicies();

    /** 动态调整全局最大并发；不得小于当前活跃租约数 */
    void updateGlobalMaxConcurrent(int maxConcurrent);
}
