package org.apache.datawise.backend.domain.pack;

import java.util.List;

/** Verified license payload persisted under {@code config/packs/license.json}. */
public record LicenseDocument(
        int version,
        String siteId,
        List<String> packs,
        String issuedAt,
        String expiresAt,
        String suiteId) {
}
