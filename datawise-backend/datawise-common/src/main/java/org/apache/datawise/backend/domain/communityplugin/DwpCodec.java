package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * {@code .dwp} = ZIP + per-file SHA-256 checksums + optional Ed25519 signature envelope.
 * <p>
 * Layout: {@code manifest.json}, {@code checksums.json}, optional {@code signature.json}, plus payload files.
 */
public final class DwpCodec {

    public static final String EXTENSION = "dwp";
    public static final String MANIFEST_ENTRY = "manifest.json";
    public static final String CHECKSUMS_ENTRY = "checksums.json";
    public static final String SIGNATURE_ENTRY = "signature.json";
    public static final long MAX_PACKAGE_BYTES = 512L * 1024 * 1024;
    public static final long MAX_ENTRY_BYTES = 256L * 1024 * 1024;
    public static final long MAX_TOTAL_UNCOMPRESSED_BYTES = 1024L * 1024 * 1024;

    private static final Pattern PLUGIN_ID = Pattern.compile("^[a-z0-9]+([.\\-][a-z0-9]+)*$");
    private static final Pattern VERSION = Pattern.compile("^\\d+\\.\\d+\\.\\d+([.\\-+][0-9A-Za-z.-]+)?$");

    private DwpCodec() {
    }

    public record VerifiedPackage(
            CommunityPluginManifest manifest,
            Map<String, byte[]> entries,
            String packageSha256,
            boolean signed,
            String signingKeyId) {

        public VerifiedPackage {
            if (signingKeyId != null && signingKeyId.isBlank()) {
                signingKeyId = null;
            }
        }
    }

    /**
     * Build an unsigned development package (for tests / CLI package step).
     */
    public static byte[] buildUnsigned(
                                       CommunityPluginManifest manifest,
                                       Map<String, byte[]> payloadEntries,
                                       ObjectMapper mapper) throws IOException {
        Objects.requireNonNull(manifest, "manifest");
        validateManifest(manifest);
        Map<String, byte[]> payload = new LinkedHashMap<>();
        if (payloadEntries != null) {
            for (Map.Entry<String, byte[]> e : payloadEntries.entrySet()) {
                if (e.getKey() == null || e.getValue() == null) {
                    continue;
                }
                String name = normalizeEntryName(e.getKey());
                if (MANIFEST_ENTRY.equals(name) || CHECKSUMS_ENTRY.equals(name) || SIGNATURE_ENTRY.equals(name)) {
                    throw new IllegalArgumentException("Reserved entry name: " + name);
                }
                payload.put(name, e.getValue());
            }
        }
        byte[] manifestBytes = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(manifest);
        payload.put(MANIFEST_ENTRY, manifestBytes);

        Map<String, String> checksums = new LinkedHashMap<>();
        for (Map.Entry<String, byte[]> e : payload.entrySet()) {
            checksums.put(e.getKey(), sha256Hex(e.getValue()));
        }
        byte[] checksumsBytes = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(checksums);

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(bos)) {
            writeZipEntry(zos, MANIFEST_ENTRY, manifestBytes);
            writeZipEntry(zos, CHECKSUMS_ENTRY, checksumsBytes);
            for (Map.Entry<String, byte[]> e : payload.entrySet()) {
                if (MANIFEST_ENTRY.equals(e.getKey())) {
                    continue;
                }
                writeZipEntry(zos, e.getKey(), e.getValue());
            }
        }
        return bos.toByteArray();
    }

    /**
     * Verify package integrity. For {@link CommunityPluginInstallPolicy#SIGNED}, a trusted Ed25519
     * signature is required. Development packages may omit {@code signature.json}.
     */
    public static VerifiedPackage verify(
                                         byte[] packageBytes,
                                         CommunityPluginInstallPolicy policy,
                                         ObjectMapper mapper) throws IOException {
        return verify(packageBytes, policy, mapper, Map.of());
    }

    /**
     * @param trustedPublicKeys map of keyId → X.509 SPKI Base64 public key
     */
    public static VerifiedPackage verify(
                                         byte[] packageBytes,
                                         CommunityPluginInstallPolicy policy,
                                         ObjectMapper mapper,
                                         Map<String, String> trustedPublicKeys) throws IOException {
        if (packageBytes == null || packageBytes.length == 0) {
            throw new CommunityPluginException("Plugin package is empty");
        }
        if (packageBytes.length > MAX_PACKAGE_BYTES) {
            throw new CommunityPluginException("Plugin package exceeds " + MAX_PACKAGE_BYTES + " bytes");
        }
        String packageSha256 = sha256Hex(packageBytes);
        Map<String, byte[]> extracted = extractZip(packageBytes);
        byte[] checksumsRaw = extracted.get(CHECKSUMS_ENTRY);
        if (checksumsRaw == null) {
            throw new CommunityPluginException("Plugin package is missing " + CHECKSUMS_ENTRY);
        }
        Map<String, String> checksums = mapper.readValue(checksumsRaw, new TypeReference<>() {
        });
        verifyChecksums(extracted, checksums);

        boolean signed = extracted.containsKey(SIGNATURE_ENTRY);
        if (policy == CommunityPluginInstallPolicy.SIGNED && !signed) {
            throw new CommunityPluginException("Plugin package is missing " + SIGNATURE_ENTRY);
        }
        String signingKeyId = null;
        if (signed) {
            signingKeyId = verifySignature(checksumsRaw, extracted.get(SIGNATURE_ENTRY), mapper, trustedPublicKeys);
        }

        byte[] manifestRaw = extracted.get(MANIFEST_ENTRY);
        if (manifestRaw == null) {
            throw new CommunityPluginException("Plugin package is missing " + MANIFEST_ENTRY);
        }
        CommunityPluginManifest manifest = mapper.readValue(manifestRaw, CommunityPluginManifest.class);
        validateManifest(manifest);
        return new VerifiedPackage(manifest, extracted, packageSha256, signed, signingKeyId);
    }

    /**
     * Build a signed package for tests / packaging tools.
     */
    public static byte[] buildSigned(
                                     CommunityPluginManifest manifest,
                                     Map<String, byte[]> payloadEntries,
                                     ObjectMapper mapper,
                                     String keyId,
                                     java.security.PrivateKey privateKey) throws IOException {
        byte[] unsigned = buildUnsigned(manifest, payloadEntries, mapper);
        Map<String, byte[]> extracted = extractZip(unsigned);
        byte[] checksumsRaw = extracted.get(CHECKSUMS_ENTRY);
        byte[] signature = DwpEd25519.sign(checksumsRaw, privateKey);
        CommunityPluginSignatureEnvelope envelope = new CommunityPluginSignatureEnvelope(
                DwpEd25519.ALG,
                keyId,
                java.util.Base64.getEncoder().encodeToString(signature));
        byte[] signatureBytes = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(envelope);

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(bos)) {
            for (Map.Entry<String, byte[]> e : extracted.entrySet()) {
                writeZipEntry(zos, e.getKey(), e.getValue());
            }
            writeZipEntry(zos, SIGNATURE_ENTRY, signatureBytes);
        }
        return bos.toByteArray();
    }

    private static String verifySignature(
                                          byte[] checksumsRaw,
                                          byte[] signatureRaw,
                                          ObjectMapper mapper,
                                          Map<String, String> trustedPublicKeys) throws IOException {
        CommunityPluginSignatureEnvelope envelope =
                mapper.readValue(signatureRaw, CommunityPluginSignatureEnvelope.class);
        if (envelope == null || envelope.keyId() == null || envelope.keyId().isBlank()) {
            throw new CommunityPluginException("signature.json is missing keyId");
        }
        if (envelope.alg() != null && !envelope.alg().isBlank() && !DwpEd25519.ALG.equalsIgnoreCase(envelope.alg())) {
            throw new CommunityPluginException("Unsupported signature algorithm: " + envelope.alg());
        }
        if (envelope.signatureBase64() == null || envelope.signatureBase64().isBlank()) {
            throw new CommunityPluginException("signature.json is missing signatureBase64");
        }
        String publicKeyBase64 = trustedPublicKeys != null ? trustedPublicKeys.get(envelope.keyId()) : null;
        if (publicKeyBase64 == null || publicKeyBase64.isBlank()) {
            throw new CommunityPluginException("Signing key '" + envelope.keyId() + "' is not in the trust store");
        }
        byte[] signatureBytes;
        try {
            signatureBytes = java.util.Base64.getDecoder().decode(envelope.signatureBase64());
        } catch (IllegalArgumentException e) {
            throw new CommunityPluginException("signature.json signatureBase64 is invalid", e);
        }
        if (!DwpEd25519.verify(checksumsRaw, signatureBytes, DwpEd25519.decodePublicKey(publicKeyBase64))) {
            throw new CommunityPluginException("Plugin package signature is invalid");
        }
        return envelope.keyId();
    }

    public static void extractTo(VerifiedPackage verified, Path targetDir) throws IOException {
        Files.createDirectories(targetDir);
        for (Map.Entry<String, byte[]> e : verified.entries().entrySet()) {
            Path out = targetDir.resolve(e.getKey()).normalize();
            if (!out.startsWith(targetDir)) {
                throw new CommunityPluginException("Illegal zip entry path: " + e.getKey());
            }
            Files.createDirectories(out.getParent());
            Files.write(out, e.getValue());
        }
    }

    public static void validateManifest(CommunityPluginManifest manifest) {
        if (manifest == null) {
            throw new CommunityPluginException("manifest is required");
        }
        if (manifest.manifestVersion() < 1) {
            throw new CommunityPluginException(".dwp packages must use manifestVersion >= 1");
        }
        validatePluginId(manifest.id());
        if (manifest.name() == null || manifest.name().isBlank()) {
            throw new CommunityPluginException("manifest.name is required");
        }
        if (manifest.version() == null || !VERSION.matcher(manifest.version()).matches()) {
            throw new CommunityPluginException("manifest.version must be semver: " + manifest.version());
        }
        if (manifest.entrypoints() == null || manifest.entrypoints().backend() == null
                || manifest.entrypoints().backend().executable() == null
                || manifest.entrypoints().backend().executable().isBlank()) {
            throw new CommunityPluginException("entrypoints.backend.executable is required");
        }
    }

    public static void validatePluginId(String pluginId) {
        if (pluginId == null || pluginId.isBlank() || pluginId.length() > 128 || !PLUGIN_ID.matcher(pluginId).matches()) {
            throw new CommunityPluginException("Invalid plugin id: " + pluginId);
        }
    }

    public static String currentTarget() {
        String os = System.getProperty("os.name", "unknown").toLowerCase(Locale.ROOT);
        String arch = System.getProperty("os.arch", "unknown").toLowerCase(Locale.ROOT);
        String osPart = os.contains("win") ? "windows" : os.contains("mac") || os.contains("darwin") ? "macos" : "linux";
        String archPart = arch.contains("aarch64") || arch.contains("arm64") ? "arm64" : "x86_64";
        return osPart + "-" + archPart;
    }

    private static void verifyChecksums(Map<String, byte[]> extracted, Map<String, String> checksums) {
        Map<String, byte[]> covered = extracted.entrySet().stream()
                .filter(e -> !CHECKSUMS_ENTRY.equals(e.getKey()) && !SIGNATURE_ENTRY.equals(e.getKey()))
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a, LinkedHashMap::new));
        if (checksums.size() != covered.size()) {
            throw new CommunityPluginException("checksums.json entry count does not match package files");
        }
        for (Map.Entry<String, byte[]> e : covered.entrySet()) {
            String expected = checksums.get(e.getKey());
            if (expected == null) {
                throw new CommunityPluginException("Missing checksum for " + e.getKey());
            }
            String actual = sha256Hex(e.getValue());
            if (!expected.equalsIgnoreCase(actual)) {
                throw new CommunityPluginException("Checksum mismatch for " + e.getKey());
            }
        }
        for (String key : checksums.keySet()) {
            if (!covered.containsKey(key)) {
                throw new CommunityPluginException("Checksum for missing file: " + key);
            }
        }
    }

    private static Map<String, byte[]> extractZip(byte[] packageBytes) throws IOException {
        Map<String, byte[]> out = new LinkedHashMap<>();
        long total = 0;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(packageBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = normalizeEntryName(entry.getName());
                if (out.containsKey(name)) {
                    throw new CommunityPluginException("Duplicate zip entry: " + name);
                }
                byte[] data = readLimited(zis, MAX_ENTRY_BYTES);
                total += data.length;
                if (total > MAX_TOTAL_UNCOMPRESSED_BYTES) {
                    throw new CommunityPluginException("Uncompressed plugin package exceeds limit");
                }
                out.put(name, data);
            }
        }
        return out;
    }

    private static byte[] readLimited(InputStream in, long max) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        long total = 0;
        int n;
        while ((n = in.read(buf)) >= 0) {
            total += n;
            if (total > max) {
                throw new CommunityPluginException("Zip entry exceeds " + max + " bytes");
            }
            bos.write(buf, 0, n);
        }
        return bos.toByteArray();
    }

    private static void writeZipEntry(ZipOutputStream zos, String name, byte[] data) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        zos.putNextEntry(entry);
        zos.write(data);
        zos.closeEntry();
    }

    static String normalizeEntryName(String raw) {
        String name = raw.replace('\\', '/');
        while (name.startsWith("./")) {
            name = name.substring(2);
        }
        if (name.startsWith("/") || name.contains("..") || name.isBlank()) {
            throw new CommunityPluginException("Illegal zip entry path: " + raw);
        }
        return name;
    }

    public static String sha256Hex(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new CommunityPluginException("SHA-256 unavailable: " + e.getMessage());
        }
    }

    public static void copy(InputStream in, OutputStream out) throws IOException {
        in.transferTo(out);
    }

    public static byte[] readAll(Path path) throws IOException {
        long size = Files.size(path);
        if (size > MAX_PACKAGE_BYTES) {
            throw new CommunityPluginException("Plugin package exceeds " + MAX_PACKAGE_BYTES + " bytes");
        }
        return Files.readAllBytes(path);
    }

    public static String utf8(byte[] data) {
        return new String(data, StandardCharsets.UTF_8);
    }
}
