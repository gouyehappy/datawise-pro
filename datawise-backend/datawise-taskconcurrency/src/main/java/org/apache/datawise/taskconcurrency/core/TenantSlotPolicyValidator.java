package org.apache.datawise.taskconcurrency.core;

import org.apache.datawise.taskconcurrency.exception.PolicyValidationException;
import org.apache.datawise.taskconcurrency.model.SlotLease;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;

import java.util.List;

/** 动态调整租户卡槽策略时的校验 */
public final class TenantSlotPolicyValidator
{
    private TenantSlotPolicyValidator()
    {
    }

    public static void validate(TenantSlotPolicy policy, List<SlotLease> activeLeases)
    {
        if (policy.getTenantId() <= 0) {
            throw new PolicyValidationException("tenantId must be positive");
        }
        if (policy.getAllocatedSlots() < 0) {
            throw new PolicyValidationException("allocatedSlots must be >= 0");
        }
        if (policy.getReservedSlots() < 0) {
            throw new PolicyValidationException("reservedSlots must be >= 0");
        }

        int ownedUsed = 0;
        int running = 0;
        for (SlotLease lease : activeLeases) {
            if (lease.getSlotOwnerTenantId() == policy.getTenantId()) {
                ownedUsed++;
            }
            if (lease.getTenantId() == policy.getTenantId()) {
                running++;
            }
        }

        if (policy.getAllocatedSlots() < ownedUsed) {
            throw new PolicyValidationException(String.format(
                    "tenant %d allocatedSlots=%d cannot be less than current owner slots in use (%d)",
                    policy.getTenantId(), policy.getAllocatedSlots(), ownedUsed));
        }
        if (policy.getMaxConcurrent() < running) {
            throw new PolicyValidationException(String.format(
                    "tenant %d maxConcurrent=%d cannot be less than current running tasks (%d)",
                    policy.getTenantId(), policy.getMaxConcurrent(), running));
        }
    }
}
