package org.apache.datawise.taskconcurrency.api;

import org.apache.datawise.taskconcurrency.model.GlobalSlotPolicy;
import org.apache.datawise.taskconcurrency.model.PendingTask;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TaskPoolStatus;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * 并发状态持久化抽象。
 * <p>
 * 所有读写均在 {@link #executeExclusive(Runnable)} 临界区内完成，以保证调度一致性。
 * 分布式实现需在此方法内加全局互斥锁（如 JDBC {@code SELECT ... FOR UPDATE}）。
 */
public interface TaskConcurrencyStore
{
    void executeExclusive(Runnable action);

    <T> T executeExclusive(Supplier<T> action);

    GlobalSlotPolicy loadGlobalPolicy();

    Map<Integer, TenantSlotPolicy> loadTenantPolicies();

    /** 读取单个租户卡槽策略 */
    Optional<TenantSlotPolicy> findTenantPolicy(int tenantId);

    /**
     * 新增或更新租户卡槽策略（运行时动态调整）。
     * 调用方应在互斥区内先校验再写入。
     */
    void upsertTenantPolicy(TenantSlotPolicy policy);

    /** 更新全局最大并发（运行时动态调整） */
    void saveGlobalPolicy(GlobalSlotPolicy policy);

    /** 列出 {@link TaskPoolStatus#PENDING} 状态、可被调度的任务 */
    List<PendingTask> listPendingTasks();

    /** 列出 {@link TaskPoolStatus#DISPATCHED} 状态、已分配卡槽等待 ack 的任务 */
    List<PendingTask> listDispatchedTasks();

    Optional<PendingTask> findPoolTask(String taskId);

    List<SlotLease> listActiveLeases();

    /** 幂等入队：taskId 已存在于任务池或租约表时返回 false */
    boolean insertPendingIfAbsent(PendingTask task);

    /** ack 成功后从任务池物理删除 */
    void deletePending(String taskId);

    /** 仅取消 PENDING 状态任务，DISPATCHED 需等待 ack 或租约回收 */
    boolean cancelPendingIfWaiting(String taskId);

    /** dispatch 成功：PENDING → DISPATCHED，任务仍保留在池中 */
    void markDispatched(String taskId, Instant dispatchedAt);

    /** 租约过期或宕机恢复：DISPATCHED → PENDING，可再次被调度 */
    void requeueDispatched(String taskId);

    void insertLease(SlotLease lease);

    void deleteLease(String taskId);

    /** 执行中续期心跳，防止长任务被误判为僵死租约 */
    void updateLeaseHeartbeat(String taskId, Instant heartbeatAt);

    /**
     * 回收 heartbeat 早于阈值的僵死租约，并将对应任务重新置为 PENDING。
     *
     * @return 回收并重新入队的任务数
     */
    int reclaimExpiredLeases(Instant threshold);

    /**
     * 修复 DISPATCHED 但无租约的孤儿任务（如宕机导致 lease 丢失）。
     *
     * @return 修复条数
     */
    int recoverOrphanedDispatched();
}
