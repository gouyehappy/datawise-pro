package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.domain.pack.AiFreeUsageDocument;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * AI access: entitled pack.ai uses tenant quota; Standard uses site free daily calls.
 * Open mode never blocks here (tenant quota still applies in AiController).
 */
@Service
public class AiAccessGuard implements AiAccessGate {

    private final EntitlementService entitlementService;
    private final EntitlementProperties properties;
    private final PackStateStore stateStore;

    public AiAccessGuard(
            EntitlementService entitlementService,
            EntitlementProperties properties,
            PackStateStore stateStore
    ) {
        this.entitlementService = entitlementService;
        this.properties = properties;
        this.stateStore = stateStore;
    }

    /**
     * @return {@code true} if pack.ai is usable (caller should apply tenant AI quota);
     *         {@code false} if a free Standard call was consumed.
     */
    @Override
    public boolean requireAiCallAccess() {
        if (properties.isOpen() || isAiEntitled()) {
            return true;
        }
        int limit = Math.max(0, properties.getFreeAiCallsDailyLimit());
        if (limit <= 0) {
            throw PackEntitlementException.licenseRequired(PackIds.AI);
        }
        try {
            AiFreeUsageDocument before = stateStore.readAiFreeUsage();
            if (before.calls() >= limit) {
                throw PackEntitlementException.quotaExceeded(
                        "Free AI daily quota exceeded (" + limit + "). Unlock AI Pack to continue."
                );
            }
            AiFreeUsageDocument after = stateStore.consumeAiFreeCall(limit);
            if (after.calls() > limit) {
                throw PackEntitlementException.quotaExceeded(
                        "Free AI daily quota exceeded (" + limit + "). Unlock AI Pack to continue."
                );
            }
            return false;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to record free AI usage: " + ex.getMessage(), ex);
        }
    }

    /** Settings / RAG admin / knowledge — require pack (no free allowance). */
    @Override
    public void requireAiPack() {
        if (properties.isOpen() || isAiEntitled()) {
            return;
        }
        throw PackEntitlementException.licenseRequired(PackIds.AI);
    }

    @Override
    public int freeAiCallsRemaining() {
        if (properties.isOpen() || isAiEntitled()) {
            return -1; // N/A — entitled / open
        }
        int limit = Math.max(0, properties.getFreeAiCallsDailyLimit());
        AiFreeUsageDocument usage = stateStore.readAiFreeUsage();
        return Math.max(0, limit - usage.calls());
    }

    /** Hybrid {@code pack.ai} or Offline {@code pack.ai.offline}. */
    private boolean isAiEntitled() {
        return entitlementService.isPackUsable(PackIds.AI)
                || entitlementService.isPackUsable(PackIds.AI_OFFLINE);
    }
}
