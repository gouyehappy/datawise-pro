package org.apache.datawise.backend.domain.pack;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackIdsAiOfflineTest {

    @Test
    void offlineSkuIsReservedInAll() {
        assertTrue(PackIds.ALL.contains(PackIds.AI_OFFLINE));
        assertTrue(PackIds.isAiPack(PackIds.AI));
        assertTrue(PackIds.isAiPack(PackIds.AI_OFFLINE));
        assertFalse(PackIds.isAiPack(PackIds.GOVERNANCE));
    }

    @Test
    void grantsAiAccessFromEitherSku() {
        assertTrue(PackIds.grantsAiAccess(List.of(PackIds.AI_OFFLINE)));
        assertTrue(PackIds.grantsAiAccess(Set.of(PackIds.AI, PackIds.MIGRATION)));
        assertFalse(PackIds.grantsAiAccess(List.of(PackIds.GOVERNANCE)));
    }

    @Test
    void suitesDoNotAutoIncludeOfflineSku() {
        assertFalse(PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_PRO).contains(PackIds.AI_OFFLINE));
        assertFalse(PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_ENTERPRISE).contains(PackIds.AI_OFFLINE));
        assertFalse(PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_PLATFORM).contains(PackIds.AI_OFFLINE));
        assertTrue(PackSuiteMap.expandLicensedPacks(List.of(PackIds.AI_OFFLINE), null).contains(PackIds.AI_OFFLINE));
    }
}
