package org.apache.datawise.taskconcurrency.core;

import org.apache.datawise.taskconcurrency.model.PendingTask;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;

import lombok.Builder;
import lombok.Value;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 基于当前租约与等待队列统计租户卡槽占用，计算可借出数量。
 * <p>
 * 可借出规则（租户优先）：
 * <ul>
 *   <li>若该租户仍有 {@link #pendingQueueCount} &gt; 0 的待调度任务，则 {@code lendableSlots = 0}，不外借</li>
 *   <li>否则 {@code lendable = allocated - reserved - slotOwnerCount}</li>
 * </ul>
 */
public final class TenantSlotMetrics
{
    private TenantSlotMetrics()
    {
    }

    public static Map<Integer, Stats> compute(
            Map<Integer, TenantSlotPolicy> policies,
            List<SlotLease> leases,
            List<PendingTask> pendingQueue)
    {
        Map<Integer, Integer> pendingByTenant = pendingQueue.stream()
                .collect(Collectors.groupingBy(PendingTask::getTenantId, Collectors.summingInt(t -> 1)));

        Map<Integer, int[]> ownerUsed = new HashMap<>();
        Map<Integer, int[]> running = new HashMap<>();
        Map<Integer, int[]> borrowedIn = new HashMap<>();
        Map<Integer, int[]> lentOut = new HashMap<>();

        for (SlotLease lease : leases) {
            bump(ownerUsed, lease.getSlotOwnerTenantId());
            bump(running, lease.getTenantId());
            if (lease.isBorrowed()) {
                bump(borrowedIn, lease.getTenantId());
                bump(lentOut, lease.getSlotOwnerTenantId());
            }
        }

        Map<Integer, Stats> result = new HashMap<>();
        for (TenantSlotPolicy policy : policies.values()) {
            if (!policy.isEnabled()) {
                continue;
            }
            int tid = policy.getTenantId();
            int ownedUsed = ownerUsed.getOrDefault(tid, zero())[0];
            int pendingQueueCount = pendingByTenant.getOrDefault(tid, 0);
            result.put(tid, Stats.builder()
                    .tenantId(tid)
                    .allocatedSlots(policy.getAllocatedSlots())
                    .reservedSlots(policy.effectiveReserved())
                    .slotOwnerCount(ownedUsed)
                    .runningCount(running.getOrDefault(tid, zero())[0])
                    .borrowedInCount(borrowedIn.getOrDefault(tid, zero())[0])
                    .lentOutCount(lentOut.getOrDefault(tid, zero())[0])
                    .pendingQueueCount(pendingQueueCount)
                    .lendableSlots(calcLendable(policy.getAllocatedSlots(), policy.effectiveReserved(),
                            ownedUsed, pendingQueueCount))
                    .build());
        }
        return result;
    }

    /** 有等待任务时不外借；否则在 reserved 之外仅借出真正空闲的自有卡槽 */
    static int calcLendable(int allocated, int reserved, int ownedUsed, int pendingQueueCount)
    {
        if (pendingQueueCount > 0) {
            return 0;
        }
        return Math.max(0, allocated - reserved - ownedUsed);
    }

    private static int[] zero()
    {
        return new int[]{0};
    }

    private static void bump(Map<Integer, int[]> map, int key)
    {
        map.computeIfAbsent(key, k -> new int[]{0})[0]++;
    }

    @Value
    @Builder(toBuilder = true)
    public static class Stats
    {
        int tenantId;
        int allocatedSlots;
        int reservedSlots;
        int slotOwnerCount;
        int runningCount;
        int borrowedInCount;
        int lentOutCount;
        /** 该租户 PENDING 状态、尚未调度的任务数 */
        int pendingQueueCount;
        int lendableSlots;

        public int runningOnOwnSlots()
        {
            return runningCount - borrowedInCount;
        }

        Stats withLendableRecalculated()
        {
            return toBuilder()
                    .lendableSlots(calcLendable(allocatedSlots, reservedSlots, slotOwnerCount, pendingQueueCount))
                    .build();
        }
    }
}
