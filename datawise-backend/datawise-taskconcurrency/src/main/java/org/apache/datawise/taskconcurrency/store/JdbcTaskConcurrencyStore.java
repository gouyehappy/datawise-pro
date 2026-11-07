package org.apache.datawise.taskconcurrency.store;

import org.apache.datawise.taskconcurrency.api.TaskConcurrencyStore;
import org.apache.datawise.taskconcurrency.model.GlobalSlotPolicy;
import org.apache.datawise.taskconcurrency.model.PendingTask;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TaskPoolStatus;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;

import javax.sql.DataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * 基于 JDBC 的分布式存储。
 * <p>
 * 互斥机制：{@link #executeExclusive(Supplier)} 开启事务并对 {@code dw_tc_global} 行
 * {@code SELECT ... FOR UPDATE}，多实例同时 dispatch 时仅一个持有锁。
 */
public class JdbcTaskConcurrencyStore implements TaskConcurrencyStore
{
    private final DataSource dataSource;
    private final ThreadLocal<Connection> txConnection = new ThreadLocal<>();

    public JdbcTaskConcurrencyStore(DataSource dataSource)
    {
        this.dataSource = dataSource;
    }

    @Override
    public void executeExclusive(Runnable action)
    {
        executeExclusive(() -> {
            action.run();
            return null;
        });
    }

    @Override
    public <T> T executeExclusive(Supplier<T> action)
    {
        Connection conn = null;
        try {
            conn = dataSource.getConnection();
            conn.setAutoCommit(false);
            txConnection.set(conn);
            lockGlobal(conn);
            T result = action.get();
            conn.commit();
            return result;
        } catch (RuntimeException ex) {
            rollbackQuietly(conn);
            throw ex;
        } catch (Exception ex) {
            rollbackQuietly(conn);
            throw new IllegalStateException("Task concurrency store failed", ex);
        } finally {
            txConnection.remove();
            closeQuietly(conn);
        }
    }

    private Connection openConnection() throws SQLException
    {
        Connection bound = txConnection.get();
        return bound != null ? bound : dataSource.getConnection();
    }

    private void maybeClose(Connection conn)
    {
        if (txConnection.get() == null) {
            closeQuietly(conn);
        }
    }

    private void lockGlobal(Connection conn) throws SQLException
    {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT max_concurrent FROM dw_tc_global WHERE id = 1 FOR UPDATE");
                ResultSet rs = ps.executeQuery()) {
            if (!rs.next()) {
                throw new IllegalStateException("dw_tc_global row missing; run schema SQL first");
            }
        }
    }

    @Override
    public GlobalSlotPolicy loadGlobalPolicy()
    {
        Connection conn = null;
        try {
            conn = openConnection();
            try (Statement st = conn.createStatement();
                    ResultSet rs = st.executeQuery("SELECT max_concurrent FROM dw_tc_global WHERE id = 1")) {
                if (!rs.next()) {
                    return GlobalSlotPolicy.builder().build();
                }
                return GlobalSlotPolicy.builder().maxConcurrent(rs.getInt(1)).build();
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public Map<Integer, TenantSlotPolicy> loadTenantPolicies()
    {
        Map<Integer, TenantSlotPolicy> map = new LinkedHashMap<>();
        String sql = """
                SELECT tenant_id, allocated_slots, reserved_slots, max_concurrent, enabled
                FROM dw_tc_tenant ORDER BY tenant_id
                """;
        Connection conn = null;
        try {
            conn = openConnection();
            try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
                while (rs.next()) {
                    map.put(rs.getInt(1), TenantSlotPolicy.builder()
                            .tenantId(rs.getInt(1))
                            .allocatedSlots(rs.getInt(2))
                            .reservedSlots(rs.getInt(3))
                            .maxConcurrent(rs.getInt(4))
                            .enabled(rs.getInt(5) == 1)
                            .build());
                }
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
        return map;
    }

    @Override
    public Optional<TenantSlotPolicy> findTenantPolicy(int tenantId)
    {
        String sql = """
                SELECT tenant_id, allocated_slots, reserved_slots, max_concurrent, enabled
                FROM dw_tc_tenant WHERE tenant_id = ?
                """;
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, tenantId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        return Optional.empty();
                    }
                    return Optional.of(TenantSlotPolicy.builder()
                            .tenantId(rs.getInt(1))
                            .allocatedSlots(rs.getInt(2))
                            .reservedSlots(rs.getInt(3))
                            .maxConcurrent(rs.getInt(4))
                            .enabled(rs.getInt(5) == 1)
                            .build());
                }
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public void upsertTenantPolicy(TenantSlotPolicy policy)
    {
        String sql = """
                INSERT INTO dw_tc_tenant(tenant_id, allocated_slots, reserved_slots, max_concurrent, enabled)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  allocated_slots = VALUES(allocated_slots),
                  reserved_slots = VALUES(reserved_slots),
                  max_concurrent = VALUES(max_concurrent),
                  enabled = VALUES(enabled)
                """;
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, policy.getTenantId());
                ps.setInt(2, policy.getAllocatedSlots());
                ps.setInt(3, policy.effectiveReserved());
                ps.setInt(4, policy.getMaxConcurrent());
                ps.setInt(5, policy.isEnabled() ? 1 : 0);
                ps.executeUpdate();
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public void saveGlobalPolicy(GlobalSlotPolicy policy)
    {
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE dw_tc_global SET max_concurrent = ? WHERE id = 1")) {
                ps.setInt(1, policy.getMaxConcurrent());
                ps.executeUpdate();
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public List<PendingTask> listPendingTasks()
    {
        return listPoolTasksByStatus(TaskPoolStatus.PENDING);
    }

    @Override
    public List<PendingTask> listDispatchedTasks()
    {
        return listPoolTasksByStatus(TaskPoolStatus.DISPATCHED);
    }

    @Override
    public Optional<PendingTask> findPoolTask(String taskId)
    {
        String sql = """
                SELECT task_id, tenant_id, priority, enqueue_time, status, dispatched_at
                FROM dw_tc_pending_task WHERE task_id = ?
                """;
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, taskId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        return Optional.empty();
                    }
                    return Optional.of(mapPoolTask(rs));
                }
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    private List<PendingTask> listPoolTasksByStatus(TaskPoolStatus status)
    {
        List<PendingTask> list = new ArrayList<>();
        String sql = """
                SELECT task_id, tenant_id, priority, enqueue_time, status, dispatched_at
                FROM dw_tc_pending_task WHERE status = ?
                """;
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, status.name());
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        list.add(mapPoolTask(rs));
                    }
                }
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
        return list;
    }

    @Override
    public List<SlotLease> listActiveLeases()
    {
        List<SlotLease> list = new ArrayList<>();
        String sql = """
                SELECT task_id, tenant_id, slot_owner_tenant_id, borrowed, priority,
                       instance_id, acquired_at, heartbeat_at
                FROM dw_tc_slot_lease
                """;
        Connection conn = null;
        try {
            conn = openConnection();
            try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
                while (rs.next()) {
                    list.add(mapLease(rs));
                }
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
        return list;
    }

    @Override
    public boolean insertPendingIfAbsent(PendingTask task)
    {
        Connection conn = null;
        try {
            conn = openConnection();
            if (exists(conn, "SELECT 1 FROM dw_tc_pending_task WHERE task_id = ?", task.getTaskId())) {
                return false;
            }
            String sql = """
                    INSERT INTO dw_tc_pending_task(task_id, tenant_id, priority, enqueue_time, status)
                    VALUES (?, ?, ?, ?, 'PENDING')
                    """;
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, task.getTaskId());
                ps.setInt(2, task.getTenantId());
                ps.setInt(3, task.getPriority());
                ps.setLong(4, task.getEnqueueTime().toEpochMilli());
                ps.executeUpdate();
            }
            return true;
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public void deletePending(String taskId)
    {
        executeUpdate("DELETE FROM dw_tc_pending_task WHERE task_id = ?", taskId);
    }

    @Override
    public boolean cancelPendingIfWaiting(String taskId)
    {
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM dw_tc_pending_task WHERE task_id = ? AND status = 'PENDING'")) {
                ps.setString(1, taskId);
                return ps.executeUpdate() > 0;
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public void markDispatched(String taskId, Instant dispatchedAt)
    {
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement("""
                    UPDATE dw_tc_pending_task
                    SET status = 'DISPATCHED', dispatched_at = ?
                    WHERE task_id = ? AND status = 'PENDING'
                    """)) {
                ps.setLong(1, dispatchedAt.toEpochMilli());
                ps.setString(2, taskId);
                if (ps.executeUpdate() == 0) {
                    throw new IllegalStateException("Task not pending in pool: " + taskId);
                }
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public void requeueDispatched(String taskId)
    {
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement("""
                    UPDATE dw_tc_pending_task
                    SET status = 'PENDING', dispatched_at = NULL
                    WHERE task_id = ? AND status = 'DISPATCHED'
                    """)) {
                ps.setString(1, taskId);
                ps.executeUpdate();
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public void insertLease(SlotLease lease)
    {
        String sql = """
                INSERT INTO dw_tc_slot_lease(
                  task_id, tenant_id, slot_owner_tenant_id, borrowed, priority,
                  instance_id, acquired_at, heartbeat_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """;
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, lease.getTaskId());
                ps.setInt(2, lease.getTenantId());
                ps.setInt(3, lease.getSlotOwnerTenantId());
                ps.setInt(4, lease.isBorrowed() ? 1 : 0);
                ps.setInt(5, lease.getPriority());
                ps.setString(6, lease.getInstanceId());
                ps.setLong(7, lease.getAcquiredAt().toEpochMilli());
                ps.setLong(8, lease.getHeartbeatAt().toEpochMilli());
                ps.executeUpdate();
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public void deleteLease(String taskId)
    {
        executeUpdate("DELETE FROM dw_tc_slot_lease WHERE task_id = ?", taskId);
    }

    @Override
    public void updateLeaseHeartbeat(String taskId, Instant heartbeatAt)
    {
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE dw_tc_slot_lease SET heartbeat_at = ? WHERE task_id = ?")) {
                ps.setLong(1, heartbeatAt.toEpochMilli());
                ps.setString(2, taskId);
                ps.executeUpdate();
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public int reclaimExpiredLeases(Instant threshold)
    {
        Connection conn = null;
        try {
            conn = openConnection();
            List<String> expired = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT task_id FROM dw_tc_slot_lease WHERE heartbeat_at < ?")) {
                ps.setLong(1, threshold.toEpochMilli());
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        expired.add(rs.getString(1));
                    }
                }
            }
            for (String taskId : expired) {
                try (PreparedStatement del = conn.prepareStatement(
                        "DELETE FROM dw_tc_slot_lease WHERE task_id = ? AND heartbeat_at < ?")) {
                    del.setString(1, taskId);
                    del.setLong(2, threshold.toEpochMilli());
                    int deleted = del.executeUpdate();
                    if (deleted > 0) {
                        requeueDispatched(taskId);
                    }
                }
            }
            return expired.size();
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    @Override
    public int recoverOrphanedDispatched()
    {
        Connection conn = null;
        try {
            conn = openConnection();
            List<String> orphans = new ArrayList<>();
            String sql = """
                    SELECT p.task_id FROM dw_tc_pending_task p
                    LEFT JOIN dw_tc_slot_lease l ON p.task_id = l.task_id
                    WHERE p.status = 'DISPATCHED' AND l.task_id IS NULL
                    """;
            try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
                while (rs.next()) {
                    orphans.add(rs.getString(1));
                }
            }
            for (String taskId : orphans) {
                requeueDispatched(taskId);
            }
            return orphans.size();
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    private void executeUpdate(String sql, String taskId)
    {
        Connection conn = null;
        try {
            conn = openConnection();
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, taskId);
                ps.executeUpdate();
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        } finally {
            maybeClose(conn);
        }
    }

    private static boolean exists(Connection conn, String sql, String taskId) throws SQLException
    {
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, taskId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private static PendingTask mapPoolTask(ResultSet rs) throws SQLException
    {
        Instant dispatchedAt = null;
        long dispatchedRaw = rs.getLong(6);
        if (!rs.wasNull()) {
            dispatchedAt = Instant.ofEpochMilli(dispatchedRaw);
        }
        return PendingTask.builder()
                .taskId(rs.getString(1))
                .tenantId(rs.getInt(2))
                .priority(rs.getInt(3))
                .enqueueTime(Instant.ofEpochMilli(rs.getLong(4)))
                .status(TaskPoolStatus.valueOf(rs.getString(5)))
                .dispatchedAt(dispatchedAt)
                .build();
    }

    private static SlotLease mapLease(ResultSet rs) throws SQLException
    {
        return SlotLease.builder()
                .taskId(rs.getString(1))
                .tenantId(rs.getInt(2))
                .slotOwnerTenantId(rs.getInt(3))
                .borrowed(rs.getInt(4) == 1)
                .priority(rs.getInt(5))
                .instanceId(rs.getString(6))
                .acquiredAt(Instant.ofEpochMilli(rs.getLong(7)))
                .heartbeatAt(Instant.ofEpochMilli(rs.getLong(8)))
                .build();
    }

    private static void rollbackQuietly(Connection conn)
    {
        if (conn == null) {
            return;
        }
        try {
            conn.rollback();
        } catch (SQLException ignored) {
            // ignore
        }
    }

    private static void closeQuietly(Connection conn)
    {
        if (conn == null) {
            return;
        }
        try {
            conn.close();
        } catch (SQLException ignored) {
            // ignore
        }
    }
}
