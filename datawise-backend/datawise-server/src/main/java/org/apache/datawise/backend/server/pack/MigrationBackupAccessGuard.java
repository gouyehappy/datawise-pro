package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.domain.pack.MigrationAccessGate;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.springframework.stereotype.Service;

/**
 * Migration / Backup pack gates. Open mode is a no-op.
 * Without pack.migration, runs are capped to {@link EntitlementProperties#getFreeMigrationRowsLimit()}.
 */
@Service
public class MigrationBackupAccessGuard implements MigrationAccessGate {

    private final PackEntitlementChecker entitlementChecker;
    private final EntitlementProperties properties;

    public MigrationBackupAccessGuard(
            PackEntitlementChecker entitlementChecker,
            EntitlementProperties properties
    ) {
        this.entitlementChecker = entitlementChecker;
        this.properties = properties;
    }

    @Override
    public boolean isMigrationEntitled() {
        return properties.isOpen() || entitlementChecker.isPackUsable(PackIds.MIGRATION);
    }

    @Override
    public TableMigrationRequest applyMigrationTrialCap(TableMigrationRequest request) {
        if (request == null || isMigrationEntitled()) {
            return request;
        }
        return request.withMaxRows(resolveTrialMaxRows(request.maxRows()));
    }

    @Override
    public TableMigrationBatchRequest applyMigrationTrialCap(TableMigrationBatchRequest request) {
        if (request == null || isMigrationEntitled()) {
            return request;
        }
        return request.withMaxRows(resolveTrialMaxRows(request.maxRows()));
    }

    @Override
    public boolean isBackupEntitled() {
        return properties.isOpen() || entitlementChecker.isPackUsable(PackIds.BACKUP);
    }

    @Override
    public void requireBackupPack() {
        if (isBackupEntitled()) {
            return;
        }
        throw PackEntitlementException.licenseRequired(PackIds.BACKUP);
    }

    public int freeMigrationRowsLimit() {
        return Math.max(0, properties.getFreeMigrationRowsLimit());
    }

    private Integer resolveTrialMaxRows(Integer requested) {
        int limit = freeMigrationRowsLimit();
        if (limit <= 0) {
            throw PackEntitlementException.licenseRequired(PackIds.MIGRATION);
        }
        if (requested == null || requested <= 0) {
            return limit;
        }
        return Math.min(requested, limit);
    }
}
