package org.apache.datawise.taskconcurrency.model;

import lombok.Builder;
import lombok.Value;

/**
 * 租户级卡槽策略。
 * <p>
 * allocatedSlots 表示该租户拥有的卡槽配额（作为 slotOwner 的上限）；
 * 租户任务优先使用自有卡槽，用尽后可从其它租户 lendable 卡槽借用。
 */
@Value
@Builder
public class TenantSlotPolicy
{
    int tenantId;
    /** 租户分配到的卡槽总数（属主上限） */
    int allocatedSlots;
    /**
     * 不可借出的保留卡槽数：即使空闲也留给本租户，避免全部借出后本租户来任务无槽可用。
     */
    @Builder.Default
    int reservedSlots = 0;
    /** 租户同时运行任务上限（可使用自有 + 借用卡槽） */
    @Builder.Default
    int maxConcurrent = Integer.MAX_VALUE;
    @Builder.Default
    boolean enabled = true;

    /** 将 reserved 限制在 [0, allocated] 范围内，避免配置越界 */
    public int effectiveReserved()
    {
        return Math.min(Math.max(0, reservedSlots), Math.max(0, allocatedSlots));
    }
}
