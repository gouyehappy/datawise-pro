package org.apache.datawise.taskconcurrency.model;

import lombok.Builder;
import lombok.Value;

import java.time.Instant;

/**
 * 已分配的运行中卡槽租约。
 * <p>
 * 当 {@code borrowed=true} 时，{@code slotOwnerTenantId != tenantId}，
 * release 后卡槽回归 slotOwnerTenantId 所属租户。
 */
@Value
@Builder(toBuilder = true)
public class SlotLease
{
    String taskId;
    /** 执行任务所属租户 */
    int tenantId;
    /** 卡槽属主租户（借用时与 tenantId 不同） */
    int slotOwnerTenantId;
    /** 是否从其它租户借用卡槽 */
    boolean borrowed;
    int priority;
    /** 持有租约的实例 ID，用于分布式排查与心跳回收 */
    String instanceId;
    Instant acquiredAt;
    /** 最后心跳时间，超时由 reclaimExpiredLeases 回收 */
    Instant heartbeatAt;
}
