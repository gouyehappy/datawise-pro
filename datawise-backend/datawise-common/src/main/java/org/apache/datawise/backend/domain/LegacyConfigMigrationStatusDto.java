package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Pending / applied deprecated config layout migrations ({@code ConfigPaths} → tenant scoped).
 */
public record LegacyConfigMigrationStatusDto(
        int pendingCount,
        List<LegacyConfigMigrationItemDto> pending,
        List<LegacyConfigMigrationItemDto> migrated) {

    public LegacyConfigMigrationStatusDto {
        pending = pending == null ? List.of() : List.copyOf(pending);
        migrated = migrated == null ? List.of() : List.copyOf(migrated);
    }

    public static LegacyConfigMigrationStatusDto ofPending(List<LegacyConfigMigrationItemDto> pending) {
        List<LegacyConfigMigrationItemDto> list = pending == null ? List.of() : List.copyOf(pending);
        return new LegacyConfigMigrationStatusDto(list.size(), list, List.of());
    }
}
