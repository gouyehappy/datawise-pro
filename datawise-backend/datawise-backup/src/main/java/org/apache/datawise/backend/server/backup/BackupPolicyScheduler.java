package org.apache.datawise.backend.server.backup;

import org.apache.datawise.backend.backup.BackupPolicyStore;
import org.apache.datawise.backend.backup.BackupRunStore;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.BackupRun;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneOffset;

@Component
public class BackupPolicyScheduler {

    private final BackupPolicyStore policyStore;
    private final BackupRunStore runStore;
    private final BackupOrchestrator orchestrator;

    public BackupPolicyScheduler(
            BackupPolicyStore policyStore,
            BackupRunStore runStore,
            BackupOrchestrator orchestrator
    ) {
        this.policyStore = policyStore;
        this.runStore = runStore;
        this.orchestrator = orchestrator;
    }

    @Scheduled(fixedDelayString = "${datawise.backup.policy-poll-ms:60000}")
    public void pollDuePolicies() {
        Instant now = Instant.now();
        for (BackupPolicyStore.EnabledPolicyRef ref : policyStore.listAllEnabledWithCron()) {
            BackupPolicy policy = ref.policy();
            if (runStore.hasActiveRunForPolicy(ref.tenantId(), policy.getId())) {
                continue;
            }
            Instant lastSuccess = runStore.lastSuccessfulFinishedAt(ref.tenantId(), policy.getId()).orElse(null);
            if (!isDue(policy, ref.tenantId(), now, lastSuccess)) {
                continue;
            }
            try {
                UserContext.runAs(
                        new UserContext.Snapshot(
                                policy.getCreatedBy() != null ? policy.getCreatedBy() : 1L,
                                false,
                                "backup-policy:" + policy.getId(),
                                null,
                                ref.tenantId()
                        ),
                        () -> orchestrator.runPolicy(ref.tenantId(), policy.getId(), BackupRun.TRIGGER_SCHEDULE)
                );
            } catch (RuntimeException ignored) {
                // concurrent run rejection or transient failure — retry next poll
            }
        }
    }

    public static boolean isDue(BackupPolicy policy, String tenantId, Instant now, Instant lastRun) {
        if (policy == null || !policy.isEnabled()) {
            return false;
        }
        String cron = policy.getCronExpression();
        if (cron == null || cron.isBlank()) {
            return false;
        }
        try {
            CronExpression expression = CronExpression.parse(cron);
            Instant base = lastRun != null
                    ? lastRun
                    : (policy.getUpdatedAt() != null ? policy.getUpdatedAt() : now.minusSeconds(3600));
            var next = expression.next(base.atZone(ZoneOffset.UTC));
            return next != null && !next.toInstant().isAfter(now);
        } catch (Exception ex) {
            return false;
        }
    }
}
