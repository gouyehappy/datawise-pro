package org.apache.datawise.taskconcurrency.core;

import org.apache.datawise.taskconcurrency.api.InstanceIdentity;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyListener;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyStore;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.exception.PolicyValidationException;
import org.apache.datawise.taskconcurrency.exception.TaskConcurrencyException;
import org.apache.datawise.taskconcurrency.model.DispatchResult;
import org.apache.datawise.taskconcurrency.model.GlobalSlotPolicy;
import org.apache.datawise.taskconcurrency.model.PendingTask;
import org.apache.datawise.taskconcurrency.model.PoolSnapshot;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.apache.datawise.taskconcurrency.model.TaskPoolStatus;
import org.apache.datawise.taskconcurrency.model.TenantPoolStats;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 任务并发控制器默认实现（线程安全由 {@link TaskConcurrencyStore#executeExclusive} 保证）。
 */
public class TaskConcurrencyControllerImpl implements TaskConcurrencyController
{
    private static final Logger log = LoggerFactory.getLogger(TaskConcurrencyControllerImpl.class);

    private final TaskConcurrencyStore store;
    private final InstanceIdentity instanceIdentity;
    private final Duration leaseTtl;
    private final TaskConcurrencyListeners listeners;

    public TaskConcurrencyControllerImpl(
            TaskConcurrencyStore store,
            InstanceIdentity instanceIdentity,
            TaskConcurrencyProperties properties,
            List<TaskConcurrencyListener> listenerList)
    {
        this.store = store;
        this.instanceIdentity = instanceIdentity;
        this.leaseTtl = properties.getLeaseTtl();
        this.listeners = new TaskConcurrencyListeners(listenerList);
    }

    /** 兼容旧构造路径 */
    public TaskConcurrencyControllerImpl(
            TaskConcurrencyStore store, InstanceIdentity instanceIdentity, Duration leaseTtl)
    {
        this(store, instanceIdentity,
                TaskConcurrencyProperties.builder().leaseTtl(leaseTtl).build(),
                List.of());
    }

    @Override
    public void enqueue(TaskAdmissionRequest request)
    {
        TaskAdmissionValidator.validate(request);
        store.executeExclusive(() -> {
            PendingTask pending = PendingTask.builder()
                    .taskId(request.getTaskId().trim())
                    .tenantId(request.getTenantId())
                    .priority(clampPriority(request.getPriority()))
                    .enqueueTime(request.getEnqueueTime() == null ? Instant.now() : request.getEnqueueTime())
                    .status(TaskPoolStatus.PENDING)
                    .build();
            boolean accepted = store.insertPendingIfAbsent(pending);
            listeners.onEnqueued(request, accepted);
            if (!accepted) {
                log.debug("Duplicate enqueue ignored, taskId={}", request.getTaskId());
            }
        });
    }

    @Override
    public void cancelPending(String taskId)
    {
        requireTaskId(taskId);
        store.executeExclusive(() -> store.cancelPendingIfWaiting(taskId));
    }

    @Override
    public DispatchResult dispatch(int maxBatch)
    {
        if (maxBatch <= 0) {
            return DispatchResult.builder().build();
        }
        try {
            return store.executeExclusive(() -> doDispatch(maxBatch));
        } catch (RuntimeException ex) {
            throw wrapStoreFailure("dispatch", ex);
        }
    }

    private DispatchResult doDispatch(int maxBatch)
    {
        GlobalSlotPolicy global = store.loadGlobalPolicy();
        Map<Integer, TenantSlotPolicy> policies = store.loadTenantPolicies();
        List<SlotLease> leases = new ArrayList<>(store.listActiveLeases());
        List<PendingTask> pending = PriorityTaskOrder.sort(store.listPendingTasks());

        List<SlotLease> granted = new ArrayList<>();
        int skipped = 0;
        Map<Integer, TenantSlotMetrics.Stats> metrics =
                new HashMap<>(TenantSlotMetrics.compute(policies, leases, pending));

        Instant now = Instant.now();
        for (PendingTask task : pending) {
            if (granted.size() >= maxBatch || leases.size() >= global.getMaxConcurrent()) {
                break;
            }
            Optional<SlotAllocationEngine.Allocation> allocation = SlotAllocationEngine.tryAllocate(
                    task, global.getMaxConcurrent(), leases, policies, metrics, instanceIdentity.instanceId());
            if (allocation.isEmpty()) {
                skipped++;
                continue;
            }
            SlotLease lease = allocation.get().getLease();
            store.markDispatched(task.getTaskId(), now);
            store.insertLease(lease);
            leases.add(lease);
            SlotAllocationEngine.applyAllocation(metrics, allocation.get());
            granted.add(lease);
            listeners.onDispatched(lease);
        }
        if (log.isDebugEnabled() && (!granted.isEmpty() || skipped > 0)) {
            log.debug("Dispatch granted={} skipped={}", granted.size(), skipped);
        }
        return DispatchResult.builder().granted(granted).skippedDueToQuota(skipped).build();
    }

    @Override
    public void ack(String taskId)
    {
        requireTaskId(taskId);
        store.executeExclusive(() -> {
            store.deleteLease(taskId);
            store.deletePending(taskId);
            listeners.onAcked(taskId);
        });
    }

    @Override
    public void release(String taskId)
    {
        ack(taskId);
    }

    @Override
    public void heartbeat(String taskId)
    {
        requireTaskId(taskId);
        store.executeExclusive(() -> store.updateLeaseHeartbeat(taskId, Instant.now()));
    }

    @Override
    public Optional<SlotLease> findLease(String taskId)
    {
        requireTaskId(taskId);
        return store.executeExclusive(() -> store.listActiveLeases().stream()
                .filter(l -> l.getTaskId().equals(taskId))
                .findFirst());
    }

    @Override
    public PoolSnapshot snapshot()
    {
        return store.executeExclusive(this::buildSnapshot);
    }

    private PoolSnapshot buildSnapshot()
    {
        GlobalSlotPolicy global = store.loadGlobalPolicy();
        Map<Integer, TenantSlotPolicy> policies = store.loadTenantPolicies();
        List<SlotLease> leases = store.listActiveLeases();
        List<PendingTask> pending = store.listPendingTasks();
        List<PendingTask> dispatched = store.listDispatchedTasks();
        Map<Integer, TenantSlotMetrics.Stats> metrics = TenantSlotMetrics.compute(policies, leases, pending);

        Map<Integer, Long> pendingByTenant = pending.stream()
                .collect(Collectors.groupingBy(PendingTask::getTenantId, Collectors.counting()));
        Map<Integer, Long> dispatchedByTenant = dispatched.stream()
                .collect(Collectors.groupingBy(PendingTask::getTenantId, Collectors.counting()));

        Map<Integer, TenantPoolStats> byTenant = new HashMap<>();
        for (TenantSlotMetrics.Stats s : metrics.values()) {
            byTenant.put(s.getTenantId(), TenantPoolStats.builder()
                    .tenantId(s.getTenantId())
                    .allocatedSlots(s.getAllocatedSlots())
                    .reservedSlots(s.getReservedSlots())
                    .pendingCount(pendingByTenant.getOrDefault(s.getTenantId(), 0L).intValue())
                    .dispatchedCount(dispatchedByTenant.getOrDefault(s.getTenantId(), 0L).intValue())
                    .runningCount(s.getRunningCount())
                    .runningOnOwnSlots(s.runningOnOwnSlots())
                    .borrowedInCount(s.getBorrowedInCount())
                    .lentOutCount(s.getLentOutCount())
                    .lendableSlots(s.getLendableSlots())
                    .build());
        }
        List<PendingTask> pendingHead = PriorityTaskOrder.sort(pending).stream().limit(20).toList();
        return PoolSnapshot.builder()
                .globalMaxConcurrent(global.getMaxConcurrent())
                .globalRunning(leases.size())
                .globalPending(pending.size())
                .globalDispatched(dispatched.size())
                .byTenant(byTenant)
                .pendingHead(pendingHead)
                .build();
    }

    @Override
    public int reclaimExpiredLeases()
    {
        Instant threshold = Instant.now().minus(leaseTtl);
        int reclaimed = store.executeExclusive(() -> store.reclaimExpiredLeases(threshold));
        listeners.onReclaimed(reclaimed);
        return reclaimed;
    }

    @Override
    public int recoverOnStartup()
    {
        int recovered = store.executeExclusive(() -> {
            int count = store.recoverOrphanedDispatched();
            count += store.reclaimExpiredLeases(Instant.now().minus(leaseTtl));
            return count;
        });
        listeners.onReclaimed(recovered);
        return recovered;
    }

    @Override
    public void upsertTenantPolicy(TenantSlotPolicy policy)
    {
        store.executeExclusive(() -> {
            TenantSlotPolicyValidator.validate(policy, store.listActiveLeases());
            store.upsertTenantPolicy(policy);
            log.info("Tenant policy updated, tenantId={} allocated={} reserved={}",
                    policy.getTenantId(), policy.getAllocatedSlots(), policy.effectiveReserved());
        });
    }

    @Override
    public Optional<TenantSlotPolicy> getTenantPolicy(int tenantId)
    {
        return store.executeExclusive(() -> store.findTenantPolicy(tenantId));
    }

    @Override
    public Map<Integer, TenantSlotPolicy> listTenantPolicies()
    {
        return store.executeExclusive(store::loadTenantPolicies);
    }

    @Override
    public void updateGlobalMaxConcurrent(int maxConcurrent)
    {
        if (maxConcurrent <= 0) {
            throw new PolicyValidationException("maxConcurrent must be positive");
        }
        store.executeExclusive(() -> {
            int running = store.listActiveLeases().size();
            if (maxConcurrent < running) {
                throw new PolicyValidationException(String.format(
                        "global maxConcurrent=%d cannot be less than current running tasks (%d)",
                        maxConcurrent, running));
            }
            store.saveGlobalPolicy(GlobalSlotPolicy.builder().maxConcurrent(maxConcurrent).build());
            log.info("Global maxConcurrent updated to {}", maxConcurrent);
        });
    }

    private static int clampPriority(int priority)
    {
        return Math.max(TaskConcurrencyProperties.MIN_PRIORITY,
                Math.min(TaskConcurrencyProperties.MAX_PRIORITY, priority));
    }

    private static void requireTaskId(String taskId)
    {
        if (StringUtils.isBlank(taskId)) {
            throw new TaskConcurrencyException("taskId must not be blank");
        }
    }

    private static TaskConcurrencyException wrapStoreFailure(String action, RuntimeException ex)
    {
        if (ex instanceof TaskConcurrencyException tce) {
            return tce;
        }
        return new TaskConcurrencyException("Task concurrency " + action + " failed", ex);
    }
}
