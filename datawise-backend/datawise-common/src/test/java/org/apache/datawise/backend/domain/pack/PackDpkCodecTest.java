package org.apache.datawise.backend.domain.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackDpkCodecTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final String secret = "test-pack-secret";

    @Test
    void signedPackVerifiesAndExtracts(@TempDir Path temp) throws Exception {
        PackManifest manifest = PackManifest.of(PackIds.AI, "1.4.0");
        byte[] dpk = PackDpkCodec.build(
                manifest,
                Map.of("frontend/readme.txt", "hello".getBytes(StandardCharsets.UTF_8)),
                secret,
                mapper);
        PackDpkCodec.VerifiedPack verified = PackDpkCodec.verify(dpk, secret, false, mapper);
        assertEquals(PackIds.AI, verified.manifest().packId());
        Path out = temp.resolve("out");
        PackDpkCodec.extractPayload(verified, out);
        assertTrue(Files.isRegularFile(out.resolve("manifest.json")));
        assertEquals("hello", Files.readString(out.resolve("frontend/readme.txt")));
    }

    @Test
    void sealedModulesRoundTripOnInstallBuild(@TempDir Path temp) throws Exception {
        PackManifest manifest = PackManifest.of(PackIds.AI, "1.4.0");
        byte[] dpk = PackDpkCodec.build(
                manifest,
                Map.of("backend/module.txt", "secret-code".getBytes(StandardCharsets.UTF_8)),
                secret,
                mapper,
                true,
                "acme");
        PackDpkCodec.VerifiedPack verified = PackDpkCodec.verify(dpk, secret, false, mapper);
        assertTrue(verified.payloadEntries().keySet().stream()
                .anyMatch(n -> n.endsWith(".sealed")));
        Path out = temp.resolve("sealed-out");
        PackDpkCodec.extractPayload(verified, out);
        int n = PackDpkCodec.unsealExtracted(out, secret, PackIds.AI, "acme");
        assertTrue(n >= 1);
        assertEquals("secret-code", Files.readString(out.resolve("backend/module.txt")));
    }

    @Test
    void ed25519SignatureRoundTrip() throws Exception {
        var pair = PackEd25519.generate();
        PackManifest manifest = PackManifest.of(PackIds.AI, "1.4.0");
        byte[] dpk = PackDpkCodec.build(
                manifest,
                Map.of("frontend/readme.txt", "hello".getBytes(StandardCharsets.UTF_8)),
                secret,
                mapper,
                false,
                "",
                pair.getPrivate());
        PackDpkCodec.VerifiedPack verified = PackDpkCodec.verify(
                dpk, secret, false, mapper, pair.getPublic(), true);
        assertEquals(PackIds.AI, verified.manifest().packId());
    }

    @Test
    void requireEd25519RejectsHmacOnly() throws Exception {
        PackManifest manifest = PackManifest.of(PackIds.BACKUP, "1.0.0");
        byte[] dpk = PackDpkCodec.build(manifest, Map.of(), secret, mapper);
        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> PackDpkCodec.verify(dpk, secret, false, mapper, null, true));
        assertEquals(DatawiseErrorCodes.PACK_INTEGRITY_FAILED, ex.errorCode());
    }

    @Test
    void tamperedPayloadFailsIntegrity() throws Exception {
        PackManifest manifest = PackManifest.of(PackIds.BACKUP, "1.0.0");
        byte[] dpk = PackDpkCodec.build(manifest, Map.of(), secret, mapper);
        // flip a byte in the zip mid-stream
        dpk[dpk.length / 2] ^= 0x5A;
        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> PackDpkCodec.verify(dpk, secret, false, mapper));
        assertEquals(DatawiseErrorCodes.PACK_INTEGRITY_FAILED, ex.errorCode());
    }

    @Test
    void missingSignatureRejectedUnlessAllowUnsigned() throws Exception {
        PackManifest manifest = PackManifest.of(PackIds.DATAGEN, "2.0.0");
        byte[] unsigned = zipManifestWithPayloadDigest(manifest);
        assertThrows(PackEntitlementException.class, () -> PackDpkCodec.verify(unsigned, secret, false, mapper));
        PackDpkCodec.VerifiedPack ok = PackDpkCodec.verify(unsigned, secret, true, mapper);
        assertEquals(PackIds.DATAGEN, ok.manifest().packId());
    }

    @Test
    void allowUnsignedStillRequiresPayloadDigest() throws Exception {
        PackManifest manifest = PackManifest.of(PackIds.DATAGEN, "2.0.0");
        byte[] unsigned = zipOnlyManifest(manifest);
        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> PackDpkCodec.verify(unsigned, secret, true, mapper));
        assertEquals(DatawiseErrorCodes.PACK_INTEGRITY_FAILED, ex.errorCode());
    }

    @Test
    void coreVersionGate() {
        PackManifest manifest = new PackManifest(
                1, PackIds.AI, "1.0.0", "5.0.0", "5.99.99",
                null, null, null, true, "stable");
        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> PackDpkCodec.requireCoreCompatible(manifest, "4.1.2"));
        assertEquals(DatawiseErrorCodes.CORE_VERSION_INCOMPATIBLE, ex.errorCode());
    }

    private byte[] zipOnlyManifest(PackManifest manifest) throws Exception {
        byte[] json = mapper.writeValueAsBytes(manifest);
        var bos = new java.io.ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(bos)) {
            zos.putNextEntry(new ZipEntry(PackDpkCodec.MANIFEST_ENTRY));
            zos.write(json);
            zos.closeEntry();
        }
        return bos.toByteArray();
    }

    /** Manifest + matching payload.sha256, but no pack.sig / ed25519 (unsigned). */
    private byte[] zipManifestWithPayloadDigest(PackManifest manifest) throws Exception {
        byte[] signed = PackDpkCodec.build(manifest, Map.of(), secret, mapper);
        var bos = new java.io.ByteArrayOutputStream();
        try (var zis = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(signed));
             ZipOutputStream zos = new ZipOutputStream(bos)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();
                if (PackDpkCodec.PACK_SIG_ENTRY.equals(name) || PackDpkCodec.PACK_ED25519_ENTRY.equals(name)) {
                    continue;
                }
                zos.putNextEntry(new ZipEntry(name));
                zis.transferTo(zos);
                zos.closeEntry();
            }
        }
        return bos.toByteArray();
    }
}
