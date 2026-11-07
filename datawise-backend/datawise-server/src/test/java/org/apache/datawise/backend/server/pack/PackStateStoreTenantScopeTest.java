package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.pack.LicenseDocument;
import org.apache.datawise.backend.domain.pack.PackSuiteMap;
import org.apache.datawise.backend.domain.pack.PackTrialsDocument;
import org.apache.datawise.backend.domain.pack.PackTrialKeys;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackStateStoreTenantScopeTest {

    @TempDir
    Path tempDir;

    private PackStateStore store;

    @BeforeEach
    void setUp() {
        store = new PackStateStore(
                new ConfigDirectoryService(tempDir),
                new ObjectMapper().findAndRegisterModules());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void isolatesLicenseAndTrialsPerTenant() throws Exception {
        Instant start = Instant.parse("2026-08-01T00:00:00Z");
        Instant end = Instant.parse("2026-08-15T00:00:00Z");
        LicenseDocument acme = new LicenseDocument(
                1, "tenant-pro-trial", List.of(), start.toString(), end.toString(), PackSuiteMap.SUITE_PRO);
        store.writeLicense("acme", acme);
        store.putTrial(
                "acme",
                PackTrialKeys.SITE_PRO,
                new PackTrialsDocument.TrialEntry(start.toString(), end.toString()));
        store.markInstalled("acme", "pack.ai", "tenant-pro-trial");

        assertTrue(store.readLicense("acme").isPresent());
        assertFalse(store.readLicense("beta").isPresent());
        assertTrue(store.trialMap("acme").containsKey(PackTrialKeys.SITE_PRO));
        assertFalse(store.trialMap("beta").containsKey(PackTrialKeys.SITE_PRO));
        assertTrue(store.isInstalled("acme", "pack.ai"));
        assertFalse(store.isInstalled("beta", "pack.ai"));
        assertTrue(Files.isRegularFile(tempDir.resolve(ConfigPaths.tenantPackLicense("acme"))));
    }

    @Test
    void fallsBackToSiteLicenseForDefaultTenant() throws Exception {
        Instant start = Instant.parse("2026-08-01T00:00:00Z");
        LicenseDocument legacy = new LicenseDocument(
                1, "site-pro-trial", List.of(), start.toString(), null, PackSuiteMap.SUITE_PRO);
        Files.createDirectories(tempDir.resolve(ConfigPaths.PACKS_DIR));
        new ObjectMapper().writerWithDefaultPrettyPrinter()
                .writeValue(tempDir.resolve(ConfigPaths.PACK_LICENSE).toFile(), legacy);

        UserContext.set(1L, false, "s1", "default");
        assertEquals("site-pro-trial", store.readLicense().orElseThrow().siteId());
    }

    @Test
    void corruptLicenseFileIsDistinctFromMissing() throws Exception {
        Path license = tempDir.resolve(ConfigPaths.tenantPackLicense("acme"));
        Files.createDirectories(license.getParent());
        Files.writeString(license, "{not-valid-json");

        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> store.readLicense("acme")
        );
        assertEquals(DatawiseErrorCodes.LICENSE_CORRUPT, ex.errorCode());
        assertTrue(store.readLicense("beta").isEmpty());
    }
}
