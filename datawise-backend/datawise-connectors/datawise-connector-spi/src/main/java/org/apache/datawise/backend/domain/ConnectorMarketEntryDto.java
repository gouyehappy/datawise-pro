package org.apache.datawise.backend.domain;

import java.util.List;

public record ConnectorMarketEntryDto(
        String id,
        String label,
        boolean primary,
        boolean available,
        List<String> capabilities,
        String installHint,
        String version,
        String jarName,
        String integrityStatus,
        String downloadUrl,
        /**
         * True when a plugin JAR exists on disk but the live connector comes from the application
         * classpath (IDE / fat classpath). UI can offer “clean redundant JAR”.
         */
        boolean redundantOnDisk,
        /** Commercial pack id when this connector is paid; null for Standard free connectors. */
        String packId,
        /** True when entitlement mode is enforced and the pack is not usable. */
        boolean entitlementLocked) {

    public ConnectorMarketEntryDto(
                                   String id,
                                   String label,
                                   boolean primary,
                                   boolean available,
                                   List<String> capabilities,
                                   String installHint,
                                   String version,
                                   String jarName,
                                   String integrityStatus,
                                   String downloadUrl,
                                   boolean redundantOnDisk) {
        this(
                id,
                label,
                primary,
                available,
                capabilities,
                installHint,
                version,
                jarName,
                integrityStatus,
                downloadUrl,
                redundantOnDisk,
                null,
                false);
    }

    public ConnectorMarketEntryDto withEntitlement(String packId, boolean locked) {
        return new ConnectorMarketEntryDto(
                id,
                label,
                primary,
                available,
                capabilities,
                installHint,
                version,
                jarName,
                integrityStatus,
                downloadUrl,
                redundantOnDisk,
                packId,
                locked);
    }
}
