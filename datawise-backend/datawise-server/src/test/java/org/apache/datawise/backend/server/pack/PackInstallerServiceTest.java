package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.pack.PackDpkCodec;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.domain.pack.PackManifest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackInstallerServiceTest {

    @TempDir
    Path tempDir;

    private EntitlementProperties properties;
    private PackInstallerService installer;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        properties = new EntitlementProperties();
        properties.setMode("open");
        properties.setSigningSecret("installer-secret");
        properties.setAllowUnsigned(false);
        properties.setCoreVersion("4.1.2");
        PackStateStore store = new PackStateStore(new ConfigDirectoryService(tempDir), mapper);
        PackAuditService audit = new PackAuditService(store);
        EntitlementService entitlement = new EntitlementService(properties, store, mapper, audit);
        ConfigDirectoryService configDir = new ConfigDirectoryService(tempDir);
        PackModuleClassLoader classLoader = new PackModuleClassLoader();
        PackModuleBeanRegistrar beanRegistrar = new PackModuleBeanRegistrar(
                new org.springframework.context.support.GenericApplicationContext()
        );
        PackModuleRegistry registry = new PackModuleRegistry(configDir, classLoader, beanRegistrar);
        installer = new PackInstallerService(
                properties,
                configDir,
                entitlement,
                audit,
                store,
                mapper,
                new org.springframework.core.io.DefaultResourceLoader(),
                registry
        );
    }

    @Test
    void installsSignedDpk() throws Exception {
        byte[] dpk = PackDpkCodec.build(
                PackManifest.of(PackIds.GOVERNANCE, "1.0.0"),
                Map.of("backend/marker.txt", "ok".getBytes()),
                properties.getSigningSecret(),
                mapper
        );
        Path file = tempDir.resolve("gov.dpk");
        Files.write(file, dpk);
        installer.installFromPath(file.toString());
        Path extracted = tempDir.resolve("packs").resolve("pack.governance").resolve("backend").resolve("marker.txt");
        assertTrue(Files.isRegularFile(extracted));
        assertEquals("ok", Files.readString(extracted));
    }

    @Test
    void installsSealedModules() throws Exception {
        byte[] dpk = PackDpkCodec.build(
                PackManifest.of(PackIds.LINEAGE, "1.0.0"),
                Map.of("backend/graph.bin", new byte[]{1, 2, 3, 4}),
                properties.getSigningSecret(),
                mapper,
                true,
                ""
        );
        Path file = tempDir.resolve("lineage.dpk");
        Files.write(file, dpk);
        installer.installFromPath(file.toString());
        Path extracted = tempDir.resolve("packs").resolve("pack.lineage").resolve("backend").resolve("graph.bin");
        assertTrue(Files.isRegularFile(extracted));
        assertEquals(4, Files.readAllBytes(extracted).length);
        assertTrue(Files.notExists(extracted.resolveSibling("graph.bin.sealed")));
    }

    @Test
    void rejectsTamperedDpk() throws Exception {
        byte[] dpk = PackDpkCodec.build(
                PackManifest.of(PackIds.SECURITY, "1.0.0"),
                Map.of(),
                properties.getSigningSecret(),
                mapper
        );
        dpk[40] ^= 0x11;
        Path file = tempDir.resolve("bad.dpk");
        Files.write(file, dpk);
        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> installer.installFromPath(file.toString())
        );
        assertEquals(DatawiseErrorCodes.PACK_INTEGRITY_FAILED, ex.errorCode());
    }
}
