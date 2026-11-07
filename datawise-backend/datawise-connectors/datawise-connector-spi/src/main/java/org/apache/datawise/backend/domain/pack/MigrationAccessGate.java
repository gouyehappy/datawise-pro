package org.apache.datawise.backend.domain.pack;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationRequest;

/**
 * Migration trial cap + backup pack gate. Implemented in server; used by sync / backup controllers.
 * <p>
 * Backup: one-shot ad-hoc runs stay free; schedule / retention / restore require {@link #requireBackupPack()}.
 */
public interface MigrationAccessGate {

    boolean isMigrationEntitled();

    TableMigrationRequest applyMigrationTrialCap(TableMigrationRequest request);

    TableMigrationBatchRequest applyMigrationTrialCap(TableMigrationBatchRequest request);

    /** True when Backup Pack is usable (or entitlement mode is open). */
    boolean isBackupEntitled();

    /** Schedule / retention / restore — requires Backup Pack when enforced. */
    void requireBackupPack();
}
