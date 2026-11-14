package org.apache.datawise.backend.domain.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * {@code .dpk} = ZIP + HMAC over canonical payload digest (same secret family as DW1. licenses).
 * Layout: {@code manifest.json}, optional content, {@code signatures/payload.sha256}, {@code signatures/pack.sig}.
 */
public final class PackDpkCodec {

    public static final String MANIFEST_ENTRY = "manifest.json";
    public static final String PAYLOAD_SHA_ENTRY = "signatures/payload.sha256";
    public static final String PACK_SIG_ENTRY = "signatures/pack.sig";
    public static final String PACK_ED25519_ENTRY = PackEd25519.SIG_ENTRY;

    private PackDpkCodec() {
    }

    /** Build a signed .dpk bytes for tests / packaging. */
    public static byte[] build(
                               PackManifest manifest,
                               Map<String, byte[]> extraEntries,
                               String signingSecret,
                               ObjectMapper mapper) throws IOException {
        return build(manifest, extraEntries, signingSecret, mapper, false, null, null);
    }

    public static byte[] build(
                               PackManifest manifest,
                               Map<String, byte[]> extraEntries,
                               String signingSecret,
                               ObjectMapper mapper,
                               boolean sealModules,
                               String siteId) throws IOException {
        return build(manifest, extraEntries, signingSecret, mapper, sealModules, siteId, null);
    }

    /**
     * @param ed25519Private when non-null, also writes {@link #PACK_ED25519_ENTRY}
     */
    public static byte[] build(
                               PackManifest manifest,
                               Map<String, byte[]> extraEntries,
                               String signingSecret,
                               ObjectMapper mapper,
                               boolean sealModules,
                               String siteId,
                               java.security.PrivateKey ed25519Private) throws IOException {
        Objects.requireNonNull(manifest, "manifest");
        Map<String, byte[]> payload = new TreeMap<>();
        payload.put(MANIFEST_ENTRY, mapper.writeValueAsBytes(manifest));
        javax.crypto.SecretKey sealKey = sealModules
                ? PackSealedCrypto.deriveKey(signingSecret, manifest.packId(), siteId)
                : null;
        if (extraEntries != null) {
            for (Map.Entry<String, byte[]> e : extraEntries.entrySet()) {
                if (e.getKey() == null || e.getKey().isBlank() || e.getValue() == null) {
                    continue;
                }
                String name = normalizeEntryName(e.getKey());
                if (name.startsWith("signatures/")) {
                    throw new IllegalArgumentException("Cannot place user content under signatures/: " + name);
                }
                byte[] data = e.getValue();
                if (sealKey != null && shouldSealPath(name)) {
                    name = PackSealedCrypto.toSealedEntryName(name);
                    data = PackSealedCrypto.seal(data, sealKey);
                }
                payload.put(name, data);
            }
        }
        String digestHex = sha256HexCanonical(payload);
        byte[] digestUtf8 = digestHex.getBytes(StandardCharsets.UTF_8);
        byte[] hmacSig = hmac(digestUtf8, signingSecret);

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(bos)) {
            for (Map.Entry<String, byte[]> e : payload.entrySet()) {
                writeEntry(zos, e.getKey(), e.getValue());
            }
            writeEntry(zos, PAYLOAD_SHA_ENTRY, digestUtf8);
            writeEntry(zos, PACK_SIG_ENTRY, Base64.getUrlEncoder().withoutPadding().encode(hmacSig));
            if (ed25519Private != null) {
                byte[] ed = PackEd25519.sign(digestUtf8, ed25519Private);
                writeEntry(zos, PACK_ED25519_ENTRY, Base64.getUrlEncoder().withoutPadding().encode(ed));
            }
        }
        return bos.toByteArray();
    }

    static boolean shouldSealPath(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        return n.startsWith("backend/") || n.startsWith("frontend/") || n.startsWith("native/");
    }

    public static VerifiedPack verify(
                                      byte[] dpkBytes,
                                      String signingSecret,
                                      boolean allowUnsigned,
                                      ObjectMapper mapper) {
        return verify(dpkBytes, signingSecret, allowUnsigned, mapper, null, false);
    }

    /**
     * @param ed25519Public when non-null, {@link #PACK_ED25519_ENTRY} must verify
     * @param requireEd25519 when true, missing Ed25519 signature is fatal (even if HMAC ok)
     */
    public static VerifiedPack verify(
                                      byte[] dpkBytes,
                                      String signingSecret,
                                      boolean allowUnsigned,
                                      ObjectMapper mapper,
                                      java.security.PublicKey ed25519Public,
                                      boolean requireEd25519) {
        if (dpkBytes == null || dpkBytes.length == 0) {
            throw integrity("Empty pack file");
        }
        Map<String, byte[]> entries = readZip(dpkBytes);
        byte[] manifestBytes = entries.get(MANIFEST_ENTRY);
        if (manifestBytes == null) {
            throw integrity("Missing manifest.json");
        }
        PackManifest manifest;
        try {
            manifest = mapper.readValue(manifestBytes, PackManifest.class);
        } catch (Exception ex) {
            throw integrity("Invalid manifest.json");
        }
        validateManifest(manifest);

        Map<String, byte[]> payload = new TreeMap<>();
        for (Map.Entry<String, byte[]> e : entries.entrySet()) {
            if (!e.getKey().startsWith("signatures/")) {
                payload.put(e.getKey(), e.getValue());
            }
        }
        String expectedDigest = sha256HexCanonical(payload);
        byte[] digestUtf8 = expectedDigest.getBytes(StandardCharsets.UTF_8);
        byte[] declaredDigest = entries.get(PAYLOAD_SHA_ENTRY);
        // Always require payload↔digest consistency (even when allowUnsigned skips HMAC/Ed25519).
        if (declaredDigest == null || declaredDigest.length == 0) {
            throw integrity("Missing signatures/payload.sha256");
        }
        String declared = new String(declaredDigest, StandardCharsets.UTF_8).trim();
        if (!expectedDigest.equalsIgnoreCase(declared)) {
            throw integrity("Payload digest mismatch");
        }

        boolean hmacOk = false;
        byte[] sigBytes = entries.get(PACK_SIG_ENTRY);
        if (sigBytes != null && sigBytes.length > 0) {
            try {
                byte[] actual = Base64.getUrlDecoder().decode(new String(sigBytes, StandardCharsets.UTF_8).trim());
                byte[] expected = hmac(digestUtf8, signingSecret);
                hmacOk = constantTimeEquals(expected, actual);
            } catch (Exception ignored) {
                hmacOk = false;
            }
        }

        boolean edOk = false;
        byte[] edBytes = entries.get(PACK_ED25519_ENTRY);
        if (ed25519Public != null && edBytes != null && edBytes.length > 0) {
            try {
                byte[] actual = Base64.getUrlDecoder().decode(new String(edBytes, StandardCharsets.UTF_8).trim());
                edOk = PackEd25519.verify(digestUtf8, actual, ed25519Public);
            } catch (Exception ignored) {
                edOk = false;
            }
        }

        if (allowUnsigned) {
            return new VerifiedPack(manifest, Map.copyOf(payload));
        }
        if (requireEd25519 || ed25519Public != null) {
            if (ed25519Public == null) {
                throw integrity("Ed25519 public key required");
            }
            if (edBytes == null || edBytes.length == 0) {
                throw integrity("Missing signatures/pack.ed25519");
            }
            if (!edOk) {
                throw integrity("Ed25519 pack signature invalid");
            }
            return new VerifiedPack(manifest, Map.copyOf(payload));
        }
        if (sigBytes == null || sigBytes.length == 0) {
            throw integrity("Missing signatures/pack.sig");
        }
        if (!hmacOk) {
            throw integrity("Pack signature invalid");
        }
        return new VerifiedPack(manifest, Map.copyOf(payload));
    }

    public static VerifiedPack verifyFile(
                                          Path dpkFile,
                                          String signingSecret,
                                          boolean allowUnsigned,
                                          ObjectMapper mapper) throws IOException {
        return verify(Files.readAllBytes(dpkFile), signingSecret, allowUnsigned, mapper);
    }

    public static void validateManifest(PackManifest manifest) {
        if (manifest == null || manifest.packId() == null || manifest.packId().isBlank()) {
            throw integrity("manifest.packId required");
        }
        String packId = manifest.packId().trim();
        if (!PackIds.ALL.contains(packId)) {
            throw PackEntitlementException.licenseMismatch("Unknown pack id in manifest: " + packId);
        }
        if (manifest.version() == null || manifest.version().isBlank()) {
            throw integrity("manifest.version required");
        }
        if (manifest.schemaVersion() < 1) {
            throw integrity("manifest.schemaVersion must be >= 1");
        }
    }

    /** Semantic version compare for min/max core gates. Returns negative if a &lt; b. */
    public static int compareVersions(String a, String b) {
        int[] pa = parseVersion(a);
        int[] pb = parseVersion(b);
        for (int i = 0; i < 3; i++) {
            if (pa[i] != pb[i]) {
                return Integer.compare(pa[i], pb[i]);
            }
        }
        return 0;
    }

    public static void requireCoreCompatible(PackManifest manifest, String coreVersion) {
        if (manifest.minCoreVersion() != null && !manifest.minCoreVersion().isBlank()
                && compareVersions(coreVersion, manifest.minCoreVersion()) < 0) {
            throw new PackEntitlementException(
                    DatawiseErrorCodes.CORE_VERSION_INCOMPATIBLE,
                    "Core " + coreVersion + " < min " + manifest.minCoreVersion(),
                    409,
                    manifest.packId());
        }
        if (manifest.maxCoreVersion() != null && !manifest.maxCoreVersion().isBlank()
                && compareVersions(coreVersion, manifest.maxCoreVersion()) > 0) {
            throw new PackEntitlementException(
                    DatawiseErrorCodes.CORE_VERSION_INCOMPATIBLE,
                    "Core " + coreVersion + " > max " + manifest.maxCoreVersion(),
                    409,
                    manifest.packId());
        }
    }

    public record VerifiedPack(PackManifest manifest, Map<String, byte[]> payloadEntries) {
    }

    private static PackEntitlementException integrity(String message) {
        return new PackEntitlementException(
                DatawiseErrorCodes.PACK_INTEGRITY_FAILED,
                message,
                500);
    }

    private static Map<String, byte[]> readZip(byte[] bytes) {
        Map<String, byte[]> out = new LinkedHashMap<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = normalizeEntryName(entry.getName());
                if (name.contains("..")) {
                    throw integrity("Zip slip blocked: " + name);
                }
                out.put(name, zis.readAllBytes());
            }
        } catch (PackEntitlementException ex) {
            throw ex;
        } catch (IOException ex) {
            throw integrity("Invalid zip pack");
        }
        return out;
    }

    private static String normalizeEntryName(String raw) {
        String name = raw.replace('\\', '/');
        while (name.startsWith("./")) {
            name = name.substring(2);
        }
        if (name.startsWith("/")) {
            name = name.substring(1);
        }
        return name;
    }

    private static void writeEntry(ZipOutputStream zos, String name, byte[] data) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        zos.putNextEntry(entry);
        zos.write(data);
        zos.closeEntry();
    }

    private static String sha256HexCanonical(Map<String, byte[]> payload) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (Map.Entry<String, byte[]> e : payload.entrySet()) {
                md.update(e.getKey().getBytes(StandardCharsets.UTF_8));
                md.update((byte) 0);
                md.update(e.getValue());
            }
            return toHex(md.digest());
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    private static byte[] hmac(byte[] payload, String secret) {
        try {
            if (secret == null || secret.isBlank()) {
                throw new IllegalArgumentException("signing secret is required");
            }
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(payload);
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("HMAC failed", ex);
        }
    }

    private static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a == null || b == null || a.length != b.length) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result == 0;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format(Locale.ROOT, "%02x", b));
        }
        return sb.toString();
    }

    private static int[] parseVersion(String raw) {
        int[] out = new int[]{0, 0, 0};
        if (raw == null || raw.isBlank()) {
            return out;
        }
        String[] parts = raw.trim().split("[.+\\-]");
        for (int i = 0; i < Math.min(3, parts.length); i++) {
            try {
                out[i] = Integer.parseInt(parts[i].replaceAll("\\D", ""));
            } catch (NumberFormatException ignored) {
                out[i] = 0;
            }
        }
        return out;
    }

    /** Extract verified payload under targetDir (must already be empty or missing). */
    public static void extractPayload(VerifiedPack verified, Path targetDir) throws IOException {
        Files.createDirectories(targetDir);
        Path root = targetDir.toAbsolutePath().normalize();
        for (Map.Entry<String, byte[]> e : verified.payloadEntries().entrySet()) {
            Path dest = root.resolve(e.getKey()).normalize();
            if (!dest.startsWith(root)) {
                throw integrity("Zip slip blocked on extract: " + e.getKey());
            }
            Files.createDirectories(dest.getParent());
            try (OutputStream out = Files.newOutputStream(dest); InputStream in = new ByteArrayInputStream(e.getValue())) {
                in.transferTo(out);
            }
        }
    }

    /**
     * Decrypt {@code *.sealed} files under packRoot in place (writes plaintext sibling, deletes sealed).
     */
    public static int unsealExtracted(Path packRoot, String signingSecret, String packId, String siteId) throws IOException {
        if (packRoot == null || !Files.isDirectory(packRoot)) {
            return 0;
        }
        javax.crypto.SecretKey key = PackSealedCrypto.deriveKey(signingSecret, packId, siteId);
        int count = 0;
        try (var walk = Files.walk(packRoot)) {
            List<Path> sealed = walk
                    .filter(Files::isRegularFile)
                    .filter(p -> PackSealedCrypto.isSealedEntryName(p.getFileName().toString()))
                    .toList();
            for (Path sealedPath : sealed) {
                byte[] plain = PackSealedCrypto.unseal(Files.readAllBytes(sealedPath), key);
                String plainName = PackSealedCrypto.stripSealedSuffix(sealedPath.getFileName().toString());
                Path plainPath = sealedPath.resolveSibling(plainName);
                Files.write(plainPath, plain);
                Files.deleteIfExists(sealedPath);
                count++;
            }
        }
        return count;
    }

    public static List<String> listPayloadNames(VerifiedPack verified) {
        return new ArrayList<>(verified.payloadEntries().keySet());
    }
}
