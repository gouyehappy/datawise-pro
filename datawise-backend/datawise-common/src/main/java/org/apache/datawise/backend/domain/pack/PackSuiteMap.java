package org.apache.datawise.backend.domain.pack;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Suite → pack expansion — aligned with PRODUCT_EXTENSION_PACKS.md §3.3 / FE SUITE_CATALOG.
 */
public final class PackSuiteMap {

    public static final String SUITE_PRO = "suite.pro";
    public static final String SUITE_ENTERPRISE = "suite.enterprise";
    public static final String SUITE_PLATFORM = "suite.platform";

    /** Enterprise core (MetaDoc unlock) — connectors / datagen not required. */
    public static final List<String> ENTERPRISE_CORE = List.of(
            PackIds.AI,
            PackIds.GOVERNANCE,
            PackIds.MIGRATION,
            PackIds.BACKUP,
            PackIds.SECURITY,
            PackIds.DATAOPS,
            PackIds.LINEAGE);

    private static final Map<String, List<String>> SUITE_PACKS = Map.of(
            SUITE_PRO, List.of(PackIds.AI, PackIds.GOVERNANCE),
            SUITE_ENTERPRISE, List.copyOf(ENTERPRISE_CORE),
            SUITE_PLATFORM, List.of(
                    PackIds.AI,
                    PackIds.GOVERNANCE,
                    PackIds.MIGRATION,
                    PackIds.BACKUP,
                    PackIds.SECURITY,
                    PackIds.DATAOPS,
                    PackIds.LINEAGE,
                    PackIds.DATAGEN,
                    PackIds.CONNECTOR_ENTERPRISE,
                    PackIds.CONNECTOR_DOMESTIC,
                    PackIds.CONNECTOR_BIGDATA));

    private PackSuiteMap() {
    }

    public static List<String> packsForSuite(String suiteId) {
        if (suiteId == null || suiteId.isBlank()) {
            return List.of();
        }
        return SUITE_PACKS.getOrDefault(suiteId.trim(), List.of());
    }

    public static boolean isKnownSuite(String suiteId) {
        return suiteId != null && SUITE_PACKS.containsKey(suiteId.trim());
    }

    /** Union of known pack ids from the license list and suite expansion. */
    public static Set<String> expandLicensedPacks(List<String> packs, String suiteId) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (packs != null) {
            for (String pack : packs) {
                if (pack == null || pack.isBlank()) {
                    continue;
                }
                String id = pack.trim();
                if (PackIds.ALL.contains(id)) {
                    out.add(id);
                }
            }
        }
        out.addAll(packsForSuite(suiteId));
        return out;
    }

    /** MetaDoc unlocks with Enterprise / Platform suite or full enterprise-core packs. */
    public static boolean grantsMetaDoc(String suiteId, Set<String> licensedPacks) {
        if (SUITE_ENTERPRISE.equals(suiteId) || SUITE_PLATFORM.equals(suiteId)) {
            return true;
        }
        return licensedPacks != null && licensedPacks.containsAll(ENTERPRISE_CORE);
    }
}
