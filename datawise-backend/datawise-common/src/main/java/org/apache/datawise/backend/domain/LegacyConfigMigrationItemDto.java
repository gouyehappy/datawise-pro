package org.apache.datawise.backend.domain;

/** One legacy → tenant-scoped config path pair. */
public record LegacyConfigMigrationItemDto(
        String legacyRelativePath,
        String targetRelativePath,
        String kind) {
}
