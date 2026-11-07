package org.apache.datawise.backend.domain.pack;

import java.util.List;

/**
 * Pack / entitlement identifiers — aligned with PRODUCT_EXTENSION_PACKS.md.
 */
public final class PackIds {

    public static final String AI = "pack.ai";
    /**
     * Offline AI sealed SKU (Enterprise add-on) — parallel to Hybrid {@link #AI}.
     * Reserved for packaging; not auto-included in Pro/Enterprise suites.
     */
    public static final String AI_OFFLINE = "pack.ai.offline";
    public static final String MIGRATION = "pack.migration";
    public static final String GOVERNANCE = "pack.governance";
    public static final String LINEAGE = "pack.lineage";
    public static final String BACKUP = "pack.backup";
    public static final String DATAOPS = "pack.dataops";
    public static final String DATAGEN = "pack.datagen";
    public static final String SECURITY = "pack.security";
    public static final String CONNECTOR_ENTERPRISE = "pack.connector.enterprise";
    public static final String CONNECTOR_DOMESTIC = "pack.connector.domestic";
    public static final String CONNECTOR_BIGDATA = "pack.connector.bigdata";

    public static final List<String> ALL = List.of(
            AI,
            AI_OFFLINE,
            MIGRATION,
            GOVERNANCE,
            LINEAGE,
            BACKUP,
            DATAOPS,
            DATAGEN,
            SECURITY,
            CONNECTOR_ENTERPRISE,
            CONNECTOR_DOMESTIC,
            CONNECTOR_BIGDATA);

    private PackIds() {
    }

    /** Hybrid ({@link #AI}) or Offline ({@link #AI_OFFLINE}) entitlement id. */
    public static boolean isAiPack(String packId) {
        return AI.equals(packId) || AI_OFFLINE.equals(packId);
    }

    /** True when licensed/usable set includes any AI SKU. */
    public static boolean grantsAiAccess(Iterable<String> packIds) {
        if (packIds == null) {
            return false;
        }
        for (String id : packIds) {
            if (isAiPack(id)) {
                return true;
            }
        }
        return false;
    }
}
