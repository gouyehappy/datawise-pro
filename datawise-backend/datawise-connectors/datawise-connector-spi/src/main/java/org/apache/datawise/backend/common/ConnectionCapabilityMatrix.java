package org.apache.datawise.backend.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * 产品能力矩阵（T-CAP-1），资源 {@code connection-capability-matrix.json}。
 * 与 SPI {@link org.apache.datawise.backend.connector.ConnectorCapability} 互补：本类描述工作台产品功能位。
 */
public final class ConnectionCapabilityMatrix {

    private static final String RESOURCE = "connection-capability-matrix.json";
    private static final ConnectionCapabilityMatrix INSTANCE = load();

    private final Map<String, Profile> types;

    private ConnectionCapabilityMatrix(Map<String, Profile> types) {
        this.types = types;
    }

    public static ConnectionCapabilityMatrix get() {
        return INSTANCE;
    }

    public Optional<Profile> profile(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return Optional.empty();
        }
        // Prefer canonical DbType id (aliases like sqlite/dameng resolve here).
        Optional<Profile> byCanonical = DbType.find(dbType)
                .map(DbType::id)
                .map(types::get);
        if (byCanonical.isPresent()) {
            return byCanonical;
        }
        return Optional.ofNullable(types.get(DbType.normalizeId(dbType)));
    }

    public boolean supports(String dbType, String feature) {
        return profile(dbType)
                .map(p -> Boolean.TRUE.equals(p.features().get(feature)))
                .orElse(false);
    }

    public boolean transactionalDdl(String dbType) {
        return supports(dbType, "transactionalDdl");
    }

    public boolean specializedSurface(String dbType) {
        return profile(dbType).map(Profile::specializedSurface).orElse(false);
    }

    public record Profile(
            String dbType,
            String supportLevel,
            boolean specializedSurface,
            String formKind,
            Map<String, Boolean> features) {
    }

    private static ConnectionCapabilityMatrix load() {
        try (InputStream in = ConnectionCapabilityMatrix.class.getClassLoader().getResourceAsStream(RESOURCE)) {
            if (in == null) {
                return new ConnectionCapabilityMatrix(Collections.emptyMap());
            }
            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(in);
            JsonNode typesNode = root.path("types");
            Map<String, Profile> map = new HashMap<>();
            typesNode.fields().forEachRemaining(entry -> {
                JsonNode n = entry.getValue();
                Map<String, Boolean> features = new HashMap<>();
                n.path("features").fields().forEachRemaining(f ->
                        features.put(f.getKey(), f.getValue().asBoolean(false)));
                Profile profile = new Profile(
                        n.path("dbType").asText(entry.getKey()),
                        n.path("supportLevel").asText("browse"),
                        n.path("specializedSurface").asBoolean(false),
                        n.path("formKind").asText("other"),
                        Collections.unmodifiableMap(features));
                map.put(entry.getKey().toLowerCase(Locale.ROOT), profile);
            });
            return new ConnectionCapabilityMatrix(Collections.unmodifiableMap(map));
        } catch (Exception ex) {
            return new ConnectionCapabilityMatrix(Collections.emptyMap());
        }
    }
}
