package org.apache.datawise.backend.domain.pack;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackSuiteMapTest {

    @Test
    void proSuiteExpandsAiAndGovernance() {
        assertEquals(
                List.of(PackIds.AI, PackIds.GOVERNANCE),
                PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_PRO));
    }

    @Test
    void enterpriseSuiteMatchesCore() {
        assertEquals(PackSuiteMap.ENTERPRISE_CORE, PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_ENTERPRISE));
        assertTrue(PackSuiteMap.grantsMetaDoc(PackSuiteMap.SUITE_ENTERPRISE, Set.of()));
        assertTrue(PackSuiteMap.grantsMetaDoc(PackSuiteMap.SUITE_PLATFORM, Set.of()));
        assertFalse(PackSuiteMap.grantsMetaDoc(PackSuiteMap.SUITE_PRO, Set.of()));
    }

    @Test
    void expandMergesExplicitPacksAndSuite() {
        Set<String> expanded = PackSuiteMap.expandLicensedPacks(
                List.of(PackIds.DATAGEN),
                PackSuiteMap.SUITE_PRO);
        assertTrue(expanded.contains(PackIds.AI));
        assertTrue(expanded.contains(PackIds.GOVERNANCE));
        assertTrue(expanded.contains(PackIds.DATAGEN));
    }

    @Test
    void metaDocRequiresFullEnterpriseCoreWithoutSuite() {
        assertFalse(PackSuiteMap.grantsMetaDoc(null, Set.of(PackIds.AI, PackIds.GOVERNANCE)));
        assertTrue(PackSuiteMap.grantsMetaDoc(null, Set.copyOf(PackSuiteMap.ENTERPRISE_CORE)));
    }
}
