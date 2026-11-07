package org.apache.datawise.taskconcurrency.store;

import org.apache.datawise.taskconcurrency.api.TaskConcurrencyStore;
import org.apache.datawise.taskconcurrency.model.GlobalSlotPolicy;
import org.apache.datawise.taskconcurrency.model.PendingTask;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TaskPoolStatus;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/** 单 JVM 内存实现：ReentrantLock 互斥，适用于单元测试与单机部署 */
public class InMemoryTaskConcurrencyStore implements TaskConcurrencyStore
{
    private final ReentrantLock lock = new ReentrantLock();
    private GlobalSlotPolicy globalPolicy = GlobalSlotPolicy.builder().maxConcurrent(6).build();
    private final Map<Integer, TenantSlotPolicy> tenantPolicies = new LinkedHashMap<>();
    /** 任务池：taskId -> PendingTask（含 PENDING 与 DISPATCHED） */
    private final Map<String, PendingTask> pool = new LinkedHashMap<>();
    /** 活跃租约：taskId -> SlotLease */
    private final Map<String, SlotLease> leases = new LinkedHashMap<>();

    public InMemoryTaskConcurrencyStore configureGlobal(int maxConcurrent)
    {
        this.globalPolicy = GlobalSlotPolicy.builder().maxConcurrent(maxConcurrent).build();
        return this;
    }

    /** 测试/开发用：注册租户策略（不经 Controller 校验） */
    public InMemoryTaskConcurrencyStore putTenant(TenantSlotPolicy policy)
    {
        tenantPolicies.put(policy.getTenantId(), policy);
        return this;
    }

    @Override
    public Optional<TenantSlotPolicy> findTenantPolicy(int tenantId)
    {
        return Optional.ofNullable(tenantPolicies.get(tenantId));
    }

    @Override
    public void upsertTenantPolicy(TenantSlotPolicy policy)
    {
        tenantPolicies.put(policy.getTenantId(), policy);
    }

    @Override
    public void saveGlobalPolicy(GlobalSlotPolicy policy)
    {
        this.globalPolicy = policy;
    }

    @Override
    public void executeExclusive(Runnable action)
    {
        lock.lock();
        try {
            action.run();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public <T> T executeExclusive(Supplier<T> action)
    {
        lock.lock();
        try {
            return action.get();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public GlobalSlotPolicy loadGlobalPolicy()
    {
        return globalPolicy;
    }

    @Override
    public Map<Integer, TenantSlotPolicy> loadTenantPolicies()
    {
        return new LinkedHashMap<>(tenantPolicies);
    }

    @Override
    public List<PendingTask> listPendingTasks()
    {
        return pool.values().stream()
                .filter(t -> t.getStatus() == TaskPoolStatus.PENDING)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    @Override
    public List<PendingTask> listDispatchedTasks()
    {
        return pool.values().stream()
                .filter(t -> t.getStatus() == TaskPoolStatus.DISPATCHED)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    @Override
    public Optional<PendingTask> findPoolTask(String taskId)
    {
        return Optional.ofNullable(pool.get(taskId));
    }

    @Override
    public List<SlotLease> listActiveLeases()
    {
        return new ArrayList<>(leases.values());
    }

    @Override
    public boolean insertPendingIfAbsent(PendingTask task)
    {
        if (pool.containsKey(task.getTaskId())) {
            return false;
        }
        pool.put(task.getTaskId(), task);
        return true;
    }

    @Override
    public void deletePending(String taskId)
    {
        pool.remove(taskId);
    }

    @Override
    public boolean cancelPendingIfWaiting(String taskId)
    {
        PendingTask task = pool.get(taskId);
        if (task == null || task.getStatus() != TaskPoolStatus.PENDING) {
            return false;
        }
        pool.remove(taskId);
        return true;
    }

    @Override
    public void markDispatched(String taskId, Instant dispatchedAt)
    {
        PendingTask task = pool.get(taskId);
        if (task == null) {
            throw new IllegalStateException("Task not in pool: " + taskId);
        }
        pool.put(taskId, task.toBuilder()
                .status(TaskPoolStatus.DISPATCHED)
                .dispatchedAt(dispatchedAt)
                .build());
    }

    @Override
    public void requeueDispatched(String taskId)
    {
        PendingTask task = pool.get(taskId);
        if (task == null || task.getStatus() != TaskPoolStatus.DISPATCHED) {
            return;
        }
        pool.put(taskId, task.toBuilder()
                .status(TaskPoolStatus.PENDING)
                .dispatchedAt(null)
                .build());
    }

    @Override
    public void insertLease(SlotLease lease)
    {
        leases.put(lease.getTaskId(), lease);
    }

    @Override
    public void deleteLease(String taskId)
    {
        leases.remove(taskId);
    }

    @Override
    public void updateLeaseHeartbeat(String taskId, Instant heartbeatAt)
    {
        SlotLease lease = leases.get(taskId);
        if (lease == null) {
            return;
        }
        leases.put(taskId, lease.toBuilder().heartbeatAt(heartbeatAt).build());
    }

    @Override
    public int reclaimExpiredLeases(Instant threshold)
    {
        List<String> expired = leases.values().stream()
                .filter(l -> l.getHeartbeatAt().isBefore(threshold))
                .map(SlotLease::getTaskId)
                .toList();
        for (String taskId : expired) {
            leases.remove(taskId);
            requeueDispatched(taskId);
        }
        return expired.size();
    }

    @Override
    public int recoverOrphanedDispatched()
    {
        int count = 0;
        for (PendingTask task : listDispatchedTasks()) {
            if (!leases.containsKey(task.getTaskId())) {
                requeueDispatched(task.getTaskId());
                count++;
            }
        }
        return count;
    }
}
