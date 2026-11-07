package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.domain.LegacyConfigMigrationStatusDto;
import org.apache.datawise.backend.startup.DesktopDeferredStartup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Startup structured warning when deprecated config paths still need migration.
 * Does not auto-apply (operators use {@code datawise config migrate} or the API).
 */
@Component
@Order(40)
public class LegacyConfigPathMigrationRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyConfigPathMigrationRunner.class);

    private final LegacyConfigPathMigrationService migrationService;

    public LegacyConfigPathMigrationRunner(LegacyConfigPathMigrationService migrationService) {
        this.migrationService = migrationService;
    }

    @Override
    public void run(ApplicationArguments args) {
        // Warn-only scan — safe to defer on desktop so it does not contend with health.
        DesktopDeferredStartup.runMaybeAsync("legacy-path-scan", this::scanSync);
    }

    private void scanSync() {
        try {
            LegacyConfigMigrationStatusDto status = migrationService.scan();
            if (status.pendingCount() <= 0) {
                return;
            }
            log.warn(
                    "CONFIG_LEGACY_PATHS_PENDING count={} — run `datawise config migrate` or "
                            + "POST /api/system/config-migration/apply (see docs/CONFIG_MIGRATION.md)",
                    status.pendingCount());
        } catch (RuntimeException ex) {
            log.warn("Legacy config path scan failed: {}", ex.getMessage());
            log.debug("Legacy config path scan error", ex);
        }
    }
}
