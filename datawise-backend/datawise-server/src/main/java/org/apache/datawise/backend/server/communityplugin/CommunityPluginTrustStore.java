package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginTrustKey;
import org.apache.datawise.backend.domain.communityplugin.DwpEd25519;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Persists trusted Ed25519 public keys for signed {@code .dwp} installs.
 * Seeds the official DataWise Examples key when the trust store is empty.
 */
@Service
public class CommunityPluginTrustStore {

    private static final String SEEDED_EXAMPLES_KEY = "community-plugin-fixtures/datawise-examples.trust.json";

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;

    public CommunityPluginTrustStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public List<CommunityPluginTrustKey> listKeys() {
        ensureSeeded();
        return new ArrayList<>(readDocument().keys());
    }

    public Map<String, String> publicKeyIndex() {
        ensureSeeded();
        Map<String, String> out = new LinkedHashMap<>();
        for (CommunityPluginTrustKey key : readDocument().keys()) {
            if (key.id() != null && !key.id().isBlank() && key.publicKeyBase64() != null) {
                out.put(key.id(), key.publicKeyBase64());
            }
        }
        return out;
    }

    public List<CommunityPluginTrustKey> replaceKeys(List<CommunityPluginTrustKey> keys) {
        List<CommunityPluginTrustKey> normalized = normalize(keys);
        writeDocument(new TrustDocument(normalized));
        return normalized;
    }

    public CommunityPluginTrustKey upsertKey(CommunityPluginTrustKey key) {
        CommunityPluginTrustKey normalized = normalizeOne(key);
        List<CommunityPluginTrustKey> next = new ArrayList<>();
        boolean replaced = false;
        for (CommunityPluginTrustKey existing : listKeys()) {
            if (normalized.id().equals(existing.id())) {
                next.add(normalized);
                replaced = true;
            } else {
                next.add(existing);
            }
        }
        if (!replaced) {
            next.add(normalized);
        }
        writeDocument(new TrustDocument(next));
        return normalized;
    }

    public void deleteKey(String keyId) {
        if (keyId == null || keyId.isBlank()) {
            return;
        }
        List<CommunityPluginTrustKey> next = listKeys().stream()
                .filter(key -> !keyId.equals(key.id()))
                .toList();
        writeDocument(new TrustDocument(next));
    }

    private List<CommunityPluginTrustKey> normalize(List<CommunityPluginTrustKey> keys) {
        if (keys == null || keys.isEmpty()) {
            return List.of();
        }
        Map<String, CommunityPluginTrustKey> byId = new LinkedHashMap<>();
        for (CommunityPluginTrustKey key : keys) {
            CommunityPluginTrustKey normalized = normalizeOne(key);
            byId.put(normalized.id(), normalized);
        }
        return List.copyOf(byId.values());
    }

    private CommunityPluginTrustKey normalizeOne(CommunityPluginTrustKey key) {
        if (key == null || key.id() == null || key.id().isBlank()) {
            throw new CommunityPluginException("Trust key id is required");
        }
        String id = key.id().trim();
        if (!id.matches("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")) {
            throw new CommunityPluginException("Invalid trust key id: " + id);
        }
        if (key.publicKeyBase64() == null || key.publicKeyBase64().isBlank()) {
            throw new CommunityPluginException("Trust key publicKeyBase64 is required");
        }
        // Reject unparseable keys early.
        DwpEd25519.decodePublicKey(key.publicKeyBase64().trim());
        String label = key.label() == null || key.label().isBlank() ? id : key.label().trim();
        return new CommunityPluginTrustKey(id, label, key.publicKeyBase64().trim());
    }

    private void ensureSeeded() {
        ClassPathResource resource = new ClassPathResource(SEEDED_EXAMPLES_KEY);
        if (!resource.exists()) {
            return;
        }
        try (InputStream in = resource.getInputStream()) {
            CommunityPluginTrustKey seeded = objectMapper.readValue(in, CommunityPluginTrustKey.class);
            if (seeded == null || seeded.id() == null || seeded.publicKeyBase64() == null) {
                return;
            }
            CommunityPluginTrustKey normalized = normalizeOne(seeded);
            List<CommunityPluginTrustKey> current = readDocument().keys();
            boolean present = current.stream().anyMatch(key -> normalized.id().equals(key.id()));
            if (present) {
                return;
            }
            List<CommunityPluginTrustKey> next = new ArrayList<>(current);
            next.add(normalized);
            writeDocument(new TrustDocument(next));
        } catch (Exception e) {
            // Seed is best-effort; signed installs can still fail loudly if the key is missing.
        }
    }

    private TrustDocument readDocument() {
        Path path = keysPath();
        if (!Files.isRegularFile(path)) {
            return new TrustDocument(List.of());
        }
        try {
            TrustDocument document = objectMapper.readValue(path.toFile(), TrustDocument.class);
            return document == null || document.keys() == null ? new TrustDocument(List.of()) : document;
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to read trust keys: " + e.getMessage(), e);
        }
    }

    private void writeDocument(TrustDocument document) {
        try {
            Path path = keysPath();
            Files.createDirectories(Objects.requireNonNull(path.getParent()));
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), document);
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to write trust keys: " + e.getMessage(), e);
        }
    }

    private Path keysPath() {
        return configDirectory.resolve(ConfigPaths.COMMUNITY_PLUGIN_TRUST_KEYS);
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TrustDocument(List<CommunityPluginTrustKey> keys) {
        TrustDocument {
            keys = keys == null ? List.of() : List.copyOf(keys);
        }
    }
}
