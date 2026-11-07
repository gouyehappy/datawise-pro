package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.support.ConfigPathSandbox;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Resolves external secret references stored in connection / app config fields.
 * <p>
 * Formats:
 * <ul>
 *   <li>{@code dwsecret:env:VAR_NAME} — process environment variable</li>
 *   <li>{@code dwsecret:file:path} — file contents (relative to config dir only; absolute / {@code ..} rejected)</li>
 *   <li>{@code dwsecret:json-file:path#field} — JSON object file field (relative under config dir)</li>
 *   <li>{@code dwsecret:properties:path#key} — Java {@code .properties} file key (relative under config dir)</li>
 *   <li>{@code dwsecret:dotenv:path#KEY} — {@code .env}-style {@code KEY=value} file (relative under config dir)</li>
 *   <li>{@code dwsecret:vault:mount/data/path#field} — HashiCorp Vault KV v2
 *       ({@code VAULT_ADDR} / {@code VAULT_TOKEN}, or {@code DATAWISE_VAULT_ADDR} / {@code DATAWISE_VAULT_TOKEN})</li>
 * </ul>
 */
@Service
public class SecretReferenceResolver {

    public static final String PREFIX = "dwsecret:";
    public static final String SCHEME_ENV = "env";
    public static final String SCHEME_FILE = "file";
    public static final String SCHEME_JSON_FILE = "json-file";
    public static final String SCHEME_PROPERTIES = "properties";
    public static final String SCHEME_DOTENV = "dotenv";
    public static final String SCHEME_VAULT = "vault";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final ConfigDirectoryService configDirectory;
    private final HttpClient httpClient;
    private final Function<String, String> envLookup;

    @Autowired
    public SecretReferenceResolver(ConfigDirectoryService configDirectory) {
        this(configDirectory, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(), System::getenv);
    }

    SecretReferenceResolver(
                            ConfigDirectoryService configDirectory,
                            HttpClient httpClient,
                            Function<String, String> envLookup) {
        this.configDirectory = configDirectory;
        this.httpClient = httpClient;
        this.envLookup = envLookup != null ? envLookup : System::getenv;
    }

    public boolean isReference(String value) {
        return value != null && value.startsWith(PREFIX);
    }

    public String resolve(String stored) {
        if (!isReference(stored)) {
            return stored;
        }
        String body = stored.substring(PREFIX.length());
        int colon = body.indexOf(':');
        if (colon <= 0 || colon >= body.length() - 1) {
            throw new IllegalArgumentException("Invalid secret reference (expected dwsecret:<scheme>:<name>): " + stored);
        }
        String scheme = body.substring(0, colon).trim().toLowerCase(Locale.ROOT);
        String name = body.substring(colon + 1).trim();
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Secret reference name is empty: " + stored);
        }
        return switch (scheme) {
            case SCHEME_ENV -> resolveEnv(name, stored);
            case SCHEME_FILE -> resolveFile(name, stored);
            case SCHEME_JSON_FILE -> resolveJsonFile(name, stored);
            case SCHEME_PROPERTIES -> resolveProperties(name, stored);
            case SCHEME_DOTENV -> resolveDotenv(name, stored);
            case SCHEME_VAULT -> resolveVault(name, stored);
            default -> throw new IllegalArgumentException("Unsupported secret reference scheme: " + scheme);
        };
    }

    private static String resolveEnv(String name, String stored) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Environment secret not set: " + name + " (from " + stored + ")");
        }
        return value;
    }

    private String resolveFile(String name, String stored) {
        Path path = resolveSecretPath(name, stored);
        if (!Files.isRegularFile(path)) {
            throw new IllegalStateException("Secret file not found: " + path + " (from " + stored + ")");
        }
        try {
            String value = Files.readString(path, StandardCharsets.UTF_8).trim();
            if (value.isEmpty()) {
                throw new IllegalStateException("Secret file is empty: " + path);
            }
            return value;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read secret file: " + path, ex);
        }
    }

    private Path resolveSecretPath(String relativePath, String stored) {
        try {
            return ConfigPathSandbox.resolveInside(configDirectory.getRoot(), relativePath);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException(ex.getMessage() + " (from " + stored + ")", ex);
        }
    }

    /**
     * {@code path#field} → read JSON object file and return string field value.
     */
    private String resolveJsonFile(String pathAndField, String stored) {
        int hash = pathAndField.lastIndexOf('#');
        if (hash <= 0 || hash >= pathAndField.length() - 1) {
            throw new IllegalArgumentException(
                    "JSON file secret reference must be dwsecret:json-file:<path>#<field> (from " + stored + ")");
        }
        String pathName = pathAndField.substring(0, hash).trim();
        String field = pathAndField.substring(hash + 1).trim();
        if (pathName.isEmpty() || field.isEmpty()) {
            throw new IllegalArgumentException("JSON file path/field is empty: " + stored);
        }
        Path path = resolveSecretPath(pathName, stored);
        if (!Files.isRegularFile(path)) {
            throw new IllegalStateException("Secret JSON file not found: " + path + " (from " + stored + ")");
        }
        try {
            String body = Files.readString(path, StandardCharsets.UTF_8);
            Map<String, Object> root = JSON.readValue(body, MAP_TYPE);
            if (root == null || !root.containsKey(field)) {
                throw new IllegalStateException("Secret JSON field not found: " + field + " (from " + stored + ")");
            }
            Object value = root.get(field);
            if (value == null) {
                throw new IllegalStateException("Secret JSON field is null: " + field);
            }
            String text = String.valueOf(value).trim();
            if (text.isEmpty()) {
                throw new IllegalStateException("Secret JSON field is empty: " + field);
            }
            return text;
        } catch (IllegalStateException | IllegalArgumentException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read secret JSON file: " + path, ex);
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid secret JSON file (from " + stored + ")", ex);
        }
    }

    /**
     * {@code path#key} → load Java properties file and return property value.
     */
    private String resolveProperties(String pathAndKey, String stored) {
        int hash = pathAndKey.lastIndexOf('#');
        if (hash <= 0 || hash >= pathAndKey.length() - 1) {
            throw new IllegalArgumentException(
                    "Properties secret reference must be dwsecret:properties:<path>#<key> (from " + stored + ")");
        }
        String pathName = pathAndKey.substring(0, hash).trim();
        String key = pathAndKey.substring(hash + 1).trim();
        if (pathName.isEmpty() || key.isEmpty()) {
            throw new IllegalArgumentException("Properties path/key is empty: " + stored);
        }
        Path path = resolveSecretPath(pathName, stored);
        if (!Files.isRegularFile(path)) {
            throw new IllegalStateException("Secret properties file not found: " + path + " (from " + stored + ")");
        }
        try (var reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            java.util.Properties props = new java.util.Properties();
            props.load(reader);
            String value = props.getProperty(key);
            if (value == null) {
                throw new IllegalStateException("Secret properties key not found: " + key + " (from " + stored + ")");
            }
            String text = value.trim();
            if (text.isEmpty()) {
                throw new IllegalStateException("Secret properties key is empty: " + key);
            }
            return text;
        } catch (IllegalStateException | IllegalArgumentException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read secret properties file: " + path, ex);
        }
    }

    /**
     * {@code path#KEY} → load a {@code .env}-style file and return the KEY value
     * (supports optional {@code export}, quotes, and {@code #} comments).
     */
    private String resolveDotenv(String pathAndKey, String stored) {
        int hash = pathAndKey.lastIndexOf('#');
        if (hash <= 0 || hash >= pathAndKey.length() - 1) {
            throw new IllegalArgumentException(
                    "Dotenv secret reference must be dwsecret:dotenv:<path>#<KEY> (from " + stored + ")");
        }
        String pathName = pathAndKey.substring(0, hash).trim();
        String key = pathAndKey.substring(hash + 1).trim();
        if (pathName.isEmpty() || key.isEmpty()) {
            throw new IllegalArgumentException("Dotenv path/key is empty: " + stored);
        }
        Path path = resolveSecretPath(pathName, stored);
        if (!Files.isRegularFile(path)) {
            throw new IllegalStateException("Secret dotenv file not found: " + path + " (from " + stored + ")");
        }
        try {
            String value = readDotenvKey(Files.readString(path, StandardCharsets.UTF_8), key);
            if (value == null) {
                throw new IllegalStateException("Secret dotenv key not found: " + key + " (from " + stored + ")");
            }
            String text = value.trim();
            if (text.isEmpty()) {
                throw new IllegalStateException("Secret dotenv key is empty: " + key);
            }
            return text;
        } catch (IllegalStateException | IllegalArgumentException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read secret dotenv file: " + path, ex);
        }
    }

    /** Package-visible for unit tests. */
    static String readDotenvKey(String fileBody, String key) {
        if (fileBody == null || key == null || key.isBlank()) {
            return null;
        }
        String target = key.trim();
        for (String rawLine : fileBody.split("\\R")) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            if (line.regionMatches(true, 0, "export ", 0, 7)) {
                line = line.substring(7).trim();
            }
            int eq = line.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            String name = line.substring(0, eq).trim();
            if (!name.equals(target)) {
                continue;
            }
            String value = line.substring(eq + 1).trim();
            if ((value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2)
                    || (value.startsWith("'") && value.endsWith("'") && value.length() >= 2)) {
                value = value.substring(1, value.length() - 1);
            }
            int comment = indexOfUnquotedHash(value);
            if (comment >= 0) {
                value = value.substring(0, comment).trim();
            }
            return value;
        }
        return null;
    }

    private static int indexOfUnquotedHash(String value) {
        boolean inSingle = false;
        boolean inDouble = false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\'' && !inDouble) {
                inSingle = !inSingle;
            } else if (c == '"' && !inSingle) {
                inDouble = !inDouble;
            } else if (c == '#' && !inSingle && !inDouble) {
                return i;
            }
        }
        return -1;
    }

    /**
     * {@code path#field} → GET {@code {VAULT_ADDR}/v1/{path}} and read {@code data.data[field]} (KV v2).
     */
    private String resolveVault(String pathAndField, String stored) {
        int hash = pathAndField.lastIndexOf('#');
        if (hash <= 0 || hash >= pathAndField.length() - 1) {
            throw new IllegalArgumentException(
                    "Vault secret reference must be dwsecret:vault:<kv-v2-path>#<field> (from " + stored + ")");
        }
        String apiPath = pathAndField.substring(0, hash).trim().replaceAll("^/+", "");
        String field = pathAndField.substring(hash + 1).trim();
        if (apiPath.isEmpty() || field.isEmpty()) {
            throw new IllegalArgumentException("Vault path/field is empty: " + stored);
        }
        if (apiPath.contains("..") || apiPath.contains("\\") || apiPath.contains("//")) {
            throw new IllegalArgumentException("Invalid Vault path (from " + stored + ")");
        }
        for (String segment : apiPath.split("/")) {
            if (segment.isBlank() || ".".equals(segment) || "..".equals(segment)) {
                throw new IllegalArgumentException("Invalid Vault path segment (from " + stored + ")");
            }
        }

        String addr = firstEnv("DATAWISE_VAULT_ADDR", "VAULT_ADDR");
        String token = firstEnv("DATAWISE_VAULT_TOKEN", "VAULT_TOKEN");
        if (addr == null || addr.isBlank()) {
            throw new IllegalStateException("VAULT_ADDR (or DATAWISE_VAULT_ADDR) is not set (from " + stored + ")");
        }
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("VAULT_TOKEN (or DATAWISE_VAULT_TOKEN) is not set (from " + stored + ")");
        }

        String base = addr.endsWith("/") ? addr.substring(0, addr.length() - 1) : addr.trim();
        URI baseUri = URI.create(base);
        String baseScheme = baseUri.getScheme() != null ? baseUri.getScheme().toLowerCase(Locale.ROOT) : "";
        if (!"http".equals(baseScheme) && !"https".equals(baseScheme)) {
            throw new IllegalStateException("VAULT_ADDR must be http(s) (from " + stored + ")");
        }
        URI uri = URI.create(base + "/v1/" + apiPath);
        try {
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(10))
                    .header("X-Vault-Token", token.trim())
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException(
                        "Vault HTTP " + response.statusCode() + " for " + uri + " (from " + stored + ")");
            }
            return extractVaultField(response.body(), field, stored);
        } catch (IllegalStateException | IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("Vault secret fetch failed: " + stored + " — " + ex.getMessage(), ex);
        }
    }

    @SuppressWarnings("unchecked")
    static String extractVaultField(String jsonBody, String field, String stored) {
        try {
            Map<String, Object> root = JSON.readValue(jsonBody, MAP_TYPE);
            Object dataNode = root.get("data");
            if (!(dataNode instanceof Map<?, ?> dataMap)) {
                throw new IllegalStateException("Vault response missing data object (from " + stored + ")");
            }
            Object inner = dataMap.get("data");
            Map<?, ?> secrets;
            if (inner instanceof Map<?, ?> innerMap) {
                secrets = innerMap; // KV v2
            } else {
                secrets = dataMap; // KV v1 fallback
            }
            Object value = secrets.get(field);
            if (value == null) {
                throw new IllegalStateException("Vault secret field not found: " + field + " (from " + stored + ")");
            }
            String text = String.valueOf(value).trim();
            if (text.isEmpty()) {
                throw new IllegalStateException("Vault secret field is empty: " + field);
            }
            return text;
        } catch (IllegalStateException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid Vault JSON response (from " + stored + ")", ex);
        }
    }

    private String firstEnv(String primary, String fallback) {
        String value = envLookup.apply(primary);
        if (value != null && !value.isBlank()) {
            return value;
        }
        return envLookup.apply(fallback);
    }
}
