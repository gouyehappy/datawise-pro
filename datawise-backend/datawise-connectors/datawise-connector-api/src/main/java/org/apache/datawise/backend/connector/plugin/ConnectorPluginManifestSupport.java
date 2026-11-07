package org.apache.datawise.backend.connector.plugin;

import org.apache.datawise.backend.domain.ConnectorPluginIntegrityStatus;
import org.apache.datawise.backend.domain.ConnectorPluginManifest;
import org.apache.datawise.backend.domain.ConnectorPluginManifestEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Reads {@code manifest.json} / {@code runtime-catalog.json} beside connector JARs and verifies
 * SHA-256 digests.
 * <p>
 * Catalog parsing uses a small structural JSON reader (no Jackson) so nested objects such as
 * {@code jdbcDriver} do not drop the surrounding connector entry.
 */
public final class ConnectorPluginManifestSupport {

    private static final Logger log = LoggerFactory.getLogger(ConnectorPluginManifestSupport.class);
    public static final String MANIFEST_FILE = "manifest.json";
    /** On-demand catalog beside {@code config/plugins} (D-03); preferred for download URLs. */
    public static final String RUNTIME_CATALOG_FILE = "runtime-catalog.json";

    private ConnectorPluginManifestSupport() {
    }

    /**
     * Loads connector install metadata from {@code runtime-catalog.json} (preferred) and/or
     * {@code manifest.json}. Catalog entries supply remote {@code downloadUrl}s for slim installs.
     */
    public static Optional<ConnectorPluginManifest> readManifest(Path pluginsDir) {
        if (pluginsDir == null) {
            return Optional.empty();
        }
        Optional<ConnectorPluginManifest> catalog = readCatalogJson(resolveRuntimeCatalogPath(pluginsDir));
        Optional<ConnectorPluginManifest> manifest = readCatalogJson(pluginsDir.resolve(MANIFEST_FILE));
        if (catalog.isEmpty()) {
            return manifest;
        }
        if (manifest.isEmpty()) {
            return catalog;
        }
        return Optional.of(mergeCatalogPreferringRemote(catalog.get(), manifest.get()));
    }

    static Path resolveRuntimeCatalogPath(Path pluginsDir) {
        Path besidePlugins = pluginsDir.resolve(RUNTIME_CATALOG_FILE);
        if (Files.isRegularFile(besidePlugins)) {
            return besidePlugins;
        }
        Path parent = pluginsDir.getParent();
        if (parent != null) {
            return parent.resolve(RUNTIME_CATALOG_FILE);
        }
        return besidePlugins;
    }

    private static Optional<ConnectorPluginManifest> readCatalogJson(Path path) {
        if (path == null || !Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            String json = Files.readString(path, StandardCharsets.UTF_8);
            return Optional.of(parseManifest(json));
        } catch (IOException | RuntimeException ex) {
            log.warn("Failed to read connector catalog {}: {}", path, ex.toString());
            return Optional.empty();
        }
    }

    /**
     * Merge catalog + on-disk manifest: union by id; prefer non-blank downloadUrl / sha256 / jar
     * from the runtime catalog when present.
     */
    static ConnectorPluginManifest mergeCatalogPreferringRemote(
                                                                ConnectorPluginManifest catalog,
                                                                ConnectorPluginManifest manifest) {
        LinkedHashMap<String, ConnectorPluginManifestEntry> byId = new LinkedHashMap<>();
        for (ConnectorPluginManifestEntry entry : manifest.plugins()) {
            if (entry.id() != null && !entry.id().isBlank()) {
                byId.put(entry.id().trim().toLowerCase(Locale.ROOT), entry);
            }
        }
        for (ConnectorPluginManifestEntry remote : catalog.plugins()) {
            if (remote.id() == null || remote.id().isBlank()) {
                continue;
            }
            String key = remote.id().trim().toLowerCase(Locale.ROOT);
            ConnectorPluginManifestEntry local = byId.get(key);
            if (local == null) {
                byId.put(key, remote);
                continue;
            }
            byId.put(key, new ConnectorPluginManifestEntry(
                    local.id(),
                    firstNonBlank(remote.version(), local.version()),
                    firstNonBlank(remote.jar(), local.jar()),
                    firstNonBlank(remote.sha256(), local.sha256()),
                    firstNonBlank(remote.downloadUrl(), local.downloadUrl())));
        }
        int schema = Math.max(catalog.schemaVersion(), manifest.schemaVersion());
        String updatedAt = firstNonBlank(catalog.updatedAt(), manifest.updatedAt());
        String channel = firstNonBlank(catalog.channel(), manifest.channel());
        return new ConnectorPluginManifest(schema, updatedAt, channel, List.copyOf(byId.values()));
    }

    private static String firstNonBlank(String preferred, String fallback) {
        if (preferred != null && !preferred.isBlank()) {
            return preferred.trim();
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback.trim();
        }
        return null;
    }

    static ConnectorPluginManifest parseManifest(String json) {
        if (json == null || json.isBlank()) {
            throw new IllegalArgumentException("catalog JSON is blank");
        }
        Object root = new CatalogJsonReader(json).parseValue();
        if (!(root instanceof Map<?, ?> rootMap)) {
            throw new IllegalArgumentException("catalog root must be a JSON object");
        }
        int schemaVersion = intValue(rootMap.get("schemaVersion"), 1);
        String updatedAt = blankToNull(stringValue(rootMap.get("updatedAt")));
        String channel = blankToNull(stringValue(rootMap.get("channel")));
        List<ConnectorPluginManifestEntry> plugins = new ArrayList<>();
        // runtime-catalog.json uses "connectors"; on-disk manifest uses "plugins".
        appendPluginEntries(plugins, rootMap.get("plugins"));
        appendPluginEntries(plugins, rootMap.get("connectors"));
        return new ConnectorPluginManifest(schemaVersion, updatedAt, channel, List.copyOf(plugins));
    }

    private static void appendPluginEntries(List<ConnectorPluginManifestEntry> out, Object arrayNode) {
        if (!(arrayNode instanceof List<?> items)) {
            return;
        }
        for (Object item : items) {
            if (!(item instanceof Map<?, ?> entryMap)) {
                continue;
            }
            String id = blankToNull(stringValue(entryMap.get("id")));
            if (id == null) {
                continue;
            }
            out.add(new ConnectorPluginManifestEntry(
                    id,
                    blankToNull(stringValue(entryMap.get("version"))),
                    blankToNull(stringValue(entryMap.get("jar"))),
                    blankToNull(stringValue(entryMap.get("sha256"))),
                    blankToNull(stringValue(entryMap.get("downloadUrl")))));
        }
    }

    private static String stringValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String text) {
            return text;
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        return null;
    }

    private static int intValue(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    public static Optional<ConnectorPluginManifestEntry> findById(
                                                                  ConnectorPluginManifest manifest,
                                                                  String connectorId) {
        if (manifest == null || connectorId == null || connectorId.isBlank()) {
            return Optional.empty();
        }
        String normalized = connectorId.trim().toLowerCase(Locale.ROOT);
        return manifest.plugins().stream()
                .filter(entry -> entry.id() != null && entry.id().trim().toLowerCase(Locale.ROOT).equals(normalized))
                .findFirst();
    }

    public static Optional<ConnectorPluginManifestEntry> findByJar(
                                                                   ConnectorPluginManifest manifest,
                                                                   String jarName) {
        if (manifest == null || jarName == null || jarName.isBlank()) {
            return Optional.empty();
        }
        String normalized = jarName.trim().toLowerCase(Locale.ROOT);
        return manifest.plugins().stream()
                .filter(entry -> entry.jar() != null && entry.jar().trim().toLowerCase(Locale.ROOT).equals(normalized))
                .findFirst();
    }

    public static String sha256Hex(Path jarPath) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
        try (InputStream in = Files.newInputStream(jarPath)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) >= 0) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    public static boolean matchesSha256(Path jarPath, String expectedSha256) throws IOException {
        if (expectedSha256 == null || expectedSha256.isBlank()) {
            return true;
        }
        String actual = sha256Hex(jarPath);
        return actual.equalsIgnoreCase(expectedSha256.trim());
    }

    /**
     * Resolves marketplace integrity badge for a catalog connector id.
     *
     * @param loadedJarName jar that provided this connector at runtime, or null if bundled/unavailable
     */
    public static String resolveIntegrityStatus(
                                                boolean available,
                                                boolean fromPluginJar,
                                                Optional<ConnectorPluginManifestEntry> manifestEntry,
                                                Path pluginsDir,
                                                String loadedJarName) {
        if (available && !fromPluginJar) {
            return ConnectorPluginIntegrityStatus.BUNDLED;
        }
        if (manifestEntry.isEmpty()) {
            if (available && fromPluginJar) {
                return ConnectorPluginIntegrityStatus.UNSIGNED;
            }
            return ConnectorPluginIntegrityStatus.NONE;
        }
        ConnectorPluginManifestEntry entry = manifestEntry.get();
        String expectedSha = entry.sha256();
        if (expectedSha == null || expectedSha.isBlank()) {
            return available ? ConnectorPluginIntegrityStatus.UNSIGNED : ConnectorPluginIntegrityStatus.MISSING;
        }
        if (!available) {
            return ConnectorPluginIntegrityStatus.MISSING;
        }
        String jarName = loadedJarName != null && !loadedJarName.isBlank()
                ? loadedJarName
                : entry.jar();
        if (jarName == null || jarName.isBlank() || pluginsDir == null) {
            return ConnectorPluginIntegrityStatus.UNSIGNED;
        }
        Path jarPath = pluginsDir.resolve(jarName);
        if (!Files.isRegularFile(jarPath)) {
            return ConnectorPluginIntegrityStatus.MISSING;
        }
        try {
            return matchesSha256(jarPath, expectedSha)
                    ? ConnectorPluginIntegrityStatus.VERIFIED
                    : ConnectorPluginIntegrityStatus.MISMATCH;
        } catch (IOException ex) {
            log.warn("Failed to hash connector plugin {}: {}", jarPath, ex.toString());
            return ConnectorPluginIntegrityStatus.UNSIGNED;
        }
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    /**
     * Minimal JSON value reader for connector catalogs (objects / arrays / scalars).
     * Nested objects are preserved so parent connector entries remain visible.
     */
    private static final class CatalogJsonReader {

        private final String json;
        private int index;

        CatalogJsonReader(String json) {
            this.json = json;
        }

        Object parseValue() {
            skipWs();
            if (index >= json.length()) {
                throw new IllegalArgumentException("Unexpected end of JSON");
            }
            char c = json.charAt(index);
            if (c == '{') {
                return parseObject();
            }
            if (c == '[') {
                return parseArray();
            }
            if (c == '"') {
                return parseString();
            }
            if (c == 't' || c == 'f') {
                return parseBoolean();
            }
            if (c == 'n') {
                parseNull();
                return null;
            }
            if (c == '-' || (c >= '0' && c <= '9')) {
                return parseNumber();
            }
            throw new IllegalArgumentException("Unexpected JSON token at index " + index);
        }

        private Map<String, Object> parseObject() {
            expect('{');
            LinkedHashMap<String, Object> map = new LinkedHashMap<>();
            skipWs();
            if (peek('}')) {
                index++;
                return map;
            }
            while (true) {
                skipWs();
                String key = parseString();
                skipWs();
                expect(':');
                Object value = parseValue();
                map.put(key, value);
                skipWs();
                if (peek('}')) {
                    index++;
                    return map;
                }
                expect(',');
            }
        }

        private List<Object> parseArray() {
            expect('[');
            List<Object> list = new ArrayList<>();
            skipWs();
            if (peek(']')) {
                index++;
                return list;
            }
            while (true) {
                list.add(parseValue());
                skipWs();
                if (peek(']')) {
                    index++;
                    return list;
                }
                expect(',');
            }
        }

        private String parseString() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (index < json.length()) {
                char c = json.charAt(index++);
                if (c == '"') {
                    return sb.toString();
                }
                if (c == '\\') {
                    if (index >= json.length()) {
                        throw new IllegalArgumentException("Unterminated escape in JSON string");
                    }
                    char esc = json.charAt(index++);
                    switch (esc) {
                        case '"', '\\', '/' -> sb.append(esc);
                        case 'b' -> sb.append('\b');
                        case 'f' -> sb.append('\f');
                        case 'n' -> sb.append('\n');
                        case 'r' -> sb.append('\r');
                        case 't' -> sb.append('\t');
                        case 'u' -> {
                            if (index + 4 > json.length()) {
                                throw new IllegalArgumentException("Invalid unicode escape in JSON string");
                            }
                            String hex = json.substring(index, index + 4);
                            index += 4;
                            try {
                                sb.append((char) Integer.parseInt(hex, 16));
                            } catch (NumberFormatException ex) {
                                throw new IllegalArgumentException("Invalid unicode escape in JSON string", ex);
                            }
                        }
                        default -> throw new IllegalArgumentException("Invalid escape \\" + esc);
                    }
                } else {
                    sb.append(c);
                }
            }
            throw new IllegalArgumentException("Unterminated JSON string");
        }

        private Number parseNumber() {
            int start = index;
            if (peek('-')) {
                index++;
            }
            while (index < json.length() && isDigit(json.charAt(index))) {
                index++;
            }
            boolean decimal = false;
            if (peek('.')) {
                decimal = true;
                index++;
                while (index < json.length() && isDigit(json.charAt(index))) {
                    index++;
                }
            }
            if (peek('e') || peek('E')) {
                decimal = true;
                index++;
                if (peek('+') || peek('-')) {
                    index++;
                }
                while (index < json.length() && isDigit(json.charAt(index))) {
                    index++;
                }
            }
            String raw = json.substring(start, index);
            try {
                if (!decimal && raw.length() < 18) {
                    return Long.parseLong(raw);
                }
                return Double.parseDouble(raw);
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("Invalid JSON number: " + raw, ex);
            }
        }

        private Boolean parseBoolean() {
            if (json.startsWith("true", index)) {
                index += 4;
                return Boolean.TRUE;
            }
            if (json.startsWith("false", index)) {
                index += 5;
                return Boolean.FALSE;
            }
            throw new IllegalArgumentException("Invalid JSON boolean at index " + index);
        }

        private void parseNull() {
            if (!json.startsWith("null", index)) {
                throw new IllegalArgumentException("Invalid JSON null at index " + index);
            }
            index += 4;
        }

        private void skipWs() {
            while (index < json.length()) {
                char c = json.charAt(index);
                if (c == ' ' || c == '\n' || c == '\r' || c == '\t') {
                    index++;
                } else {
                    break;
                }
            }
        }

        private void expect(char expected) {
            skipWs();
            if (index >= json.length() || json.charAt(index) != expected) {
                throw new IllegalArgumentException("Expected '" + expected + "' at index " + index);
            }
            index++;
        }

        private boolean peek(char expected) {
            return index < json.length() && json.charAt(index) == expected;
        }

        private static boolean isDigit(char c) {
            return c >= '0' && c <= '9';
        }
    }
}
