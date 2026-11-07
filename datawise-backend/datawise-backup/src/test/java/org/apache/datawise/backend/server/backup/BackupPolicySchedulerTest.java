package org.apache.datawise.backend.server.backup;

import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BackupPolicySchedulerTest {

    @Test
    void isDue_whenCronElapsed() {
        BackupPolicy policy = new BackupPolicy();
        policy.setEnabled(true);
        // Spring cron: second minute hour day-of-month month day-of-week
        policy.setCronExpression("0 0 * * * ?");
        policy.setUpdatedAt(Instant.parse("2026-01-01T00:00:00Z"));

        Instant now = Instant.parse("2026-01-01T02:00:00Z");
        assertTrue(BackupPolicyScheduler.isDue(policy, "default", now, null));
    }

    @Test
    void isNotDue_whenRecentlyRun() {
        BackupPolicy policy = new BackupPolicy();
        policy.setEnabled(true);
        policy.setCronExpression("0 0 * * * ?");

        Instant lastRun = Instant.parse("2026-01-01T01:00:00Z");
        Instant now = Instant.parse("2026-01-01T01:30:00Z");
        assertFalse(BackupPolicyScheduler.isDue(policy, "default", now, lastRun));
    }
}
