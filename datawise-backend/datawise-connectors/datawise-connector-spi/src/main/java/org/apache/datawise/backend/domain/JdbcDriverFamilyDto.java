package org.apache.datawise.backend.domain;

import java.util.List;

/** One managed JDBC driver family in the unified driver library. */
public record JdbcDriverFamilyDto(
        String id,
        String label,
        String defaultMaven,
        String driverClass,
        List<String> relatedDbTypes,
        /** missing | installed | loaded */
        String status,
        boolean bundle,
        String bundleDir,
        int jarCount,
        long sizeBytes,
        List<JdbcDriverCachedDto> jars,
        /**
         * How the family is meant to arrive on disk:
         * {@code core} (ships with core connectors), {@code on-demand} (Maven on first use),
         * {@code sidecar} (heavy — prefer offline runtime zip / manual place under config/drivers).
         */
        String delivery) {
}
