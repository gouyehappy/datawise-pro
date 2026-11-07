package org.apache.datawise.taskconcurrency.core;

import org.apache.datawise.taskconcurrency.model.PendingTask;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 卡槽分配引擎（纯函数，无 IO）。
 * <p>
 * 分配顺序（对单条 pending 任务）：
 * <ol>
 *   <li>全局未满 + 租户 enabled + 租户 running 未达 maxConcurrent</li>
 *   <li>优先占用租户<strong>自有</strong>卡槽（slotOwner == tenantId）</li>
 *   <li>自有卡槽用尽后，从 {@code lendableSlots &gt; 0} 且<strong>无待调度任务</strong>的其它租户借用</li>
 * </ol>
 * 借出方若仍有 PENDING 任务等待执行，则不外借（租户优先）。
 */
public final class SlotAllocationEngine
{
    private SlotAllocationEngine()
    {
    }

    /**
     * 尝试为一条 pending 任务分配卡槽。
     *
     * @param leases  当前全部活跃租约（含本 dispatch 批次已分配的）
     * @param metrics 各租户实时统计（dispatch 批次内会增量更新）
     * @return 分配成功时返回租约；失败返回 empty（全局满、租户禁用、租户并发满、无可用卡槽）
     */
    public static Optional<Allocation> tryAllocate(
            PendingTask task,
            int globalMax,
            List<SlotLease> leases,
            Map<Integer, TenantSlotPolicy> policies,
            Map<Integer, TenantSlotMetrics.Stats> metrics,
            String instanceId)
    {
        if (leases.size() >= globalMax) {
            return Optional.empty();
        }
        TenantSlotPolicy policy = policies.get(task.getTenantId());
        if (policy == null || !policy.isEnabled()) {
            return Optional.empty();
        }
        TenantSlotMetrics.Stats stats = metrics.get(task.getTenantId());
        if (stats != null && stats.getRunningCount() >= policy.getMaxConcurrent()) {
            return Optional.empty();
        }

        // slotOwnerCount：该租户作为卡槽属主被占用的数量（含自有任务 + 借出给其它租户）
        int ownedUsed = stats == null ? 0 : stats.getSlotOwnerCount();
        if (ownedUsed < policy.getAllocatedSlots()) {
            return Optional.of(own(task, task.getTenantId(), instanceId));
        }

        // 自有配额已满，尝试借用其它租户空闲卡槽
        Optional<Integer> lender = findLender(metrics, task.getTenantId());
        if (lender.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(borrow(task, lender.get(), instanceId));
    }

    /**
     * 选择借出方：lendableSlots &gt; 0 且非借入方自身；优先选 lendable 最多的租户。
     */
    private static Optional<Integer> findLender(
            Map<Integer, TenantSlotMetrics.Stats> metrics, int borrowerTenantId)
    {
        return metrics.values().stream()
                .filter(s -> s.getTenantId() != borrowerTenantId && s.getLendableSlots() > 0)
                .sorted((a, b) -> Integer.compare(b.getLendableSlots(), a.getLendableSlots()))
                .map(TenantSlotMetrics.Stats::getTenantId)
                .findFirst();
    }

    /** 使用租户自有卡槽（borrowed=false） */
    private static Allocation own(PendingTask task, int ownerTenantId, String instanceId)
    {
        Instant now = Instant.now();
        SlotLease lease = SlotLease.builder()
                .taskId(task.getTaskId())
                .tenantId(task.getTenantId())
                .slotOwnerTenantId(ownerTenantId)
                .borrowed(false)
                .priority(task.getPriority())
                .instanceId(instanceId)
                .acquiredAt(now)
                .heartbeatAt(now)
                .build();
        return new Allocation(lease, ownerTenantId, false);
    }

    /** 借用其它租户卡槽（borrowed=true，slotOwnerTenantId 为借出方） */
    private static Allocation borrow(PendingTask task, int lenderTenantId, String instanceId)
    {
        Instant now = Instant.now();
        SlotLease lease = SlotLease.builder()
                .taskId(task.getTaskId())
                .tenantId(task.getTenantId())
                .slotOwnerTenantId(lenderTenantId)
                .borrowed(true)
                .priority(task.getPriority())
                .instanceId(instanceId)
                .acquiredAt(now)
                .heartbeatAt(now)
                .build();
        return new Allocation(lease, lenderTenantId, true);
    }

    /** 分配后更新内存态 metrics（pending 减 1、租约占用增加，并重新计算 lendable） */
    public static void applyAllocation(
            Map<Integer, TenantSlotMetrics.Stats> metrics, Allocation allocation)
    {
        SlotLease lease = allocation.getLease();
        TenantSlotMetrics.Stats borrower = metrics.get(lease.getTenantId());
        if (borrower != null) {
            TenantSlotMetrics.Stats updated = borrower.toBuilder()
                    .runningCount(borrower.getRunningCount() + 1)
                    .borrowedInCount(borrower.getBorrowedInCount() + (lease.isBorrowed() ? 1 : 0))
                    .pendingQueueCount(Math.max(0, borrower.getPendingQueueCount() - 1))
                    .build()
                    .withLendableRecalculated();
            metrics.put(lease.getTenantId(), updated);
        }

        int ownerId = lease.getSlotOwnerTenantId();
        TenantSlotMetrics.Stats owner = metrics.get(ownerId);
        if (owner != null) {
            TenantSlotMetrics.Stats updated = owner.toBuilder()
                    .slotOwnerCount(owner.getSlotOwnerCount() + 1)
                    .lentOutCount(owner.getLentOutCount() + (lease.isBorrowed() ? 1 : 0))
                    .build()
                    .withLendableRecalculated();
            metrics.put(ownerId, updated);
        }
    }

    /** tryAllocate 的返回值：租约 + 属主租户 + 是否借用 */
    public record Allocation(SlotLease lease, int slotOwnerTenantId, boolean borrowed)
    {
        public SlotLease getLease()
        {
            return lease;
        }
    }
}
