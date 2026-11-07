package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.domain.pack.PackAuditActions;
import org.apache.datawise.backend.domain.pack.PackAuditDocument;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Instant;
import java.util.List;

/**
 * Persists pack entitlement audit events (activate / reject / tamper / trial / deny).
 */
@Service
public class PackAuditService {

    private static final Logger log = LoggerFactory.getLogger(PackAuditService.class);
    private static final int MAX_EVENTS = 500;

    private final PackStateStore stateStore;

    public PackAuditService(PackStateStore stateStore) {
        this.stateStore = stateStore;
    }

    public List<PackAuditDocument.PackAuditEvent> listRecent(int limit) {
        int cap = Math.min(Math.max(1, limit), MAX_EVENTS);
        List<PackAuditDocument.PackAuditEvent> events = stateStore.readAudit().events();
        if (events.size() <= cap) {
            return List.copyOf(events);
        }
        return List.copyOf(events.subList(0, cap));
    }

    public void record(String action, String packId, String detail) {
        String actor = resolveActor();
        PackAuditDocument.PackAuditEvent event = new PackAuditDocument.PackAuditEvent(
                IdGenerator.shortId("pa-"),
                Instant.now().toString(),
                action,
                packId,
                detail != null ? detail : "",
                actor
        );
        try {
            stateStore.appendAudit(event, MAX_EVENTS);
        } catch (IOException ex) {
            log.warn("pack.audit.persist_failed action={} packId={} | {}", action, packId, ex.getMessage());
        }
        if (PackAuditActions.LICENSE_TAMPERED.equals(action)
                || PackAuditActions.LICENSE_REJECTED.equals(action)
                || PackAuditActions.PACK_DENIED.equals(action)) {
            log.warn("pack.audit action={} packId={} actor={} detail={}", action, packId, actor, detail);
        } else {
            log.info("pack.audit action={} packId={} actor={}", action, packId, actor);
        }
    }

    public void licenseActivated(String suiteId, List<String> packs) {
        record(
                PackAuditActions.LICENSE_ACTIVATED,
                suiteId,
                "packs=" + (packs != null ? packs.size() : 0)
        );
    }

    public void licenseRejected(String reason) {
        String action = reason != null && reason.toLowerCase().contains("signature")
                ? PackAuditActions.LICENSE_TAMPERED
                : PackAuditActions.LICENSE_REJECTED;
        record(action, null, reason);
    }

    public void trialStarted(String packId) {
        record(PackAuditActions.TRIAL_STARTED, packId, null);
    }

    public void packDenied(String packId, String detail) {
        record(PackAuditActions.PACK_DENIED, packId, detail);
    }

    private static String resolveActor() {
        try {
            Long userId = UserContext.getUserId();
            if (userId != null) {
                return "user:" + userId;
            }
        } catch (RuntimeException ignored) {
            // headless / startup
        }
        return "system";
    }
}
