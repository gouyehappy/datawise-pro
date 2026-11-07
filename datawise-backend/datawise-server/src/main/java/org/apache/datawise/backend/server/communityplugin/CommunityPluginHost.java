package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginCompatibilityGate;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginContribution;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginFormField;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginTransport;
import org.apache.datawise.backend.domain.communityplugin.InstalledCommunityPlugin;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages community plugin sidecar sessions and connection/filesystem RPCs.
 */
@Service
public class CommunityPluginHost {

    private final CommunityPluginInstaller installer;
    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, CommunityPluginSidecarSession> sessions = new ConcurrentHashMap<>();
    /**
     * Plugin ids whose package directory is being replaced. Activate is refused
     * so an open workbench cannot respawn the sidecar and re-lock the Windows
     * {@code .exe} mid-install.
     */
    private final Set<String> installingIds = ConcurrentHashMap.newKeySet();

    public CommunityPluginHost(
            CommunityPluginInstaller installer,
            ConfigDirectoryService configDirectory,
            ObjectMapper objectMapper
    ) {
        this.installer = installer;
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public CommunityPluginSidecarSession activate(String pluginId) {
        if (installingIds.contains(pluginId)) {
            throw new CommunityPluginException(
                    "Plugin '" + pluginId + "' is being installed or updated; retry after the install finishes");
        }
        CommunityPluginSidecarSession existing = sessions.get(pluginId);
        if (existing != null) {
            return existing;
        }
        synchronized (sessions) {
            if (installingIds.contains(pluginId)) {
                throw new CommunityPluginException(
                        "Plugin '" + pluginId + "' is being installed or updated; retry after the install finishes");
            }
            existing = sessions.get(pluginId);
            if (existing != null) {
                return existing;
            }
            InstalledCommunityPlugin plugin = installer.findInstalled(pluginId)
                    .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
            if (!plugin.compatibility().compatible()) {
                throw new CommunityPluginException(
                        "Plugin '" + pluginId + "' is incompatible: " + String.join("; ", plugin.compatibility().errors()));
            }
            Path dataDir = configDirectory.resolve(ConfigPaths.COMMUNITY_PLUGIN_DATA_DIR).resolve(pluginId);
            CommunityPluginSidecarSession session = CommunityPluginSidecarSession.start(
                    plugin, objectMapper, dataDir, System.getProperty("datawise.version", "4.1.0"));
            sessions.put(pluginId, session);
            return session;
        }
    }

    /** Test / advanced: register an already-started session. */
    public void putSession(String pluginId, CommunityPluginSidecarSession session) {
        sessions.put(pluginId, session);
    }

    public void stop(String pluginId) {
        CommunityPluginSidecarSession session = sessions.remove(pluginId);
        if (session != null) {
            session.close();
        }
    }

    /**
     * Stops the sidecar and blocks {@link #activate(String)} until
     * {@link #endPackageReplace(String)} so Windows can release the exe lock
     * while the installer moves the version directory.
     */
    public void beginPackageReplace(String pluginId) {
        if (pluginId == null || pluginId.isBlank()) {
            return;
        }
        installingIds.add(pluginId);
        stop(pluginId);
    }

    public void endPackageReplace(String pluginId) {
        if (pluginId == null || pluginId.isBlank()) {
            return;
        }
        installingIds.remove(pluginId);
    }

    public void stopAll() {
        for (String id : sessions.keySet()) {
            stop(id);
        }
    }

    public JsonNode invoke(String pluginId, String method, JsonNode params) {
        requireForwardableMethod(method);
        Duration timeout = resolveInvokeTimeout(pluginId, method);
        if ("workbench/close".equals(method)) {
            return invokeWorkbenchClose(pluginId, params, timeout);
        }
        return activate(pluginId).invoke(method, params, timeout);
    }

    /**
     * Close a workbench session without respawning an already-stopped sidecar.
     * Tab dispose + iframe unmount both call this; the second must stay a no-op
     * after idle-stop, otherwise Windows briefly re-locks the plugin {@code .exe}.
     */
    private JsonNode invokeWorkbenchClose(String pluginId, JsonNode params, Duration timeout) {
        CommunityPluginSidecarSession session = sessions.get(pluginId);
        if (session == null) {
            return objectMapper.createObjectNode()
                    .put("ok", true)
                    .put("sessionsRemaining", 0);
        }
        try {
            JsonNode result = session.invoke("workbench/close", params, timeout);
            // Last workbench/session closed → stop the OS process so Windows can
            // unlock the sidecar .exe (reinstall without a full app restart).
            if (isPluginIdleAfterClose(result) && sessions.remove(pluginId, session)) {
                session.close();
            }
            return result;
        } catch (CommunityPluginException e) {
            // Best-effort lifecycle: older packages may not implement workbench/close.
            if (isMethodNotFound(e)) {
                return objectMapper.createObjectNode().put("ok", true).put("ignored", true);
            }
            throw e;
        }
    }

    /** Sidecars that report {@code sessionsRemaining: 0} after workbench/close. */
    private static boolean isPluginIdleAfterClose(JsonNode result) {
        if (result == null || !result.has("sessionsRemaining") || !result.get("sessionsRemaining").canConvertToInt()) {
            return false;
        }
        return result.get("sessionsRemaining").asInt(-1) == 0;
    }

    /**
     * The generic invoke endpoint forwards plugin-private RPCs and the UI-facing
     * lifecycle calls. Host-scheduled namespaces must use their dedicated endpoints
     * so contribution capabilities stay enforced there.
     */
    private static void requireForwardableMethod(String method) {
        if (method == null || method.isBlank()) {
            throw new CommunityPluginException("method is required");
        }
        // Handshake/activate stay host-only; plugin/ping is a read-only liveness probe
        // that workbench UIs (e.g. HTTP Client) call through the bridge after activate.
        if (method.startsWith("plugin/") && !"plugin/ping".equals(method)) {
            throw new CommunityPluginException(
                    "plugin/* is host-scheduled (handshake); it cannot be invoked externally");
        }
        if (method.startsWith("filesystem/")) {
            throw new CommunityPluginException(
                    "filesystem/* is host-scheduled; use the /filesystem/{action} endpoints "
                            + "so declared capabilities are enforced");
        }
        if (method.startsWith("connection/") && !"connection/challenge/resolve".equals(method)) {
            throw new CommunityPluginException(
                    "connection/* is host-scheduled; use /connection/test|connect|disconnect|action. "
                            + "Only connection/challenge/resolve is answered through invoke.");
        }
    }

    /** JSON-RPC standard method-not-found (SDK/契约要求 sidecar 对未知方法回 -32601）。 */
    private static boolean isMethodNotFound(CommunityPluginException e) {
        Integer code = e.getRpcErrorCode();
        return code != null && code == -32601;
    }

    /**
     * Invoke timeout by capability class — never by plugin-private RPC names.
     * Connection lifecycle dials and stream-capable plugins ({@code host.binary}
     * or {@code host.events}, e.g. transfers / remote ops) get a long budget;
     * everything else uses the default.
     */
    private Duration resolveInvokeTimeout(String pluginId, String method) {
        if (method != null && method.startsWith("connection/")) {
            return Duration.ofMinutes(6);
        }
        if (hasPermission(pluginId, "host.binary") || hasPermission(pluginId, "host.events")) {
            return Duration.ofMinutes(6);
        }
        return CommunityPluginSidecarSession.DEFAULT_TIMEOUT;
    }

    private boolean hasPermission(String pluginId, String permission) {
        return installer.findInstalled(pluginId)
                .map(InstalledCommunityPlugin::manifest)
                .map(m -> m.permissions())
                .filter(list -> list != null && list.contains(permission))
                .isPresent();
    }

    public void notify(String pluginId, String method, JsonNode params) {
        activate(pluginId).notify(method, params);
    }

    public JsonNode testConnection(ConnectionConfig config) {
        String pluginId = requirePluginId(config);
        CommunityPluginContribution.ConnectionProvider provider =
                resolveConnectionProvider(pluginId, config.getPluginConnectionProvider());
        // Interactive challenges (host key, 2FA, …) can pause the dial for several minutes.
        return activate(pluginId).invoke("connection/test", connectionParams(config, provider), Duration.ofMinutes(6));
    }

    public JsonNode connect(ConnectionConfig config) {
        String pluginId = requirePluginId(config);
        CommunityPluginContribution.ConnectionProvider provider =
                resolveConnectionProvider(pluginId, config.getPluginConnectionProvider());
        return activate(pluginId).invoke("connection/connect", connectionParams(config, provider));
    }

    public JsonNode disconnect(ConnectionConfig config) {
        String pluginId = requirePluginId(config);
        CommunityPluginContribution.ConnectionProvider provider =
                resolveConnectionProvider(pluginId, config.getPluginConnectionProvider());
        return activate(pluginId).invoke("connection/disconnect", connectionParams(config, provider));
    }

    public JsonNode connectionAction(ConnectionConfig config, String actionId, JsonNode actionParams) {
        String pluginId = requirePluginId(config);
        CommunityPluginContribution.ConnectionProvider provider =
                resolveConnectionProvider(pluginId, config.getPluginConnectionProvider());
        if (actionId == null || actionId.isBlank()) {
            throw new CommunityPluginException("actionId is required");
        }
        ObjectNode params = connectionParams(config, provider);
        ObjectNode action = params.putObject("action");
        action.put("id", actionId);
        if (actionParams != null) {
            action.set("params", actionParams);
        }
        return activate(pluginId).invoke("connection/action", params);
    }

    public JsonNode filesystemList(String pluginId, String providerId, String uri, Integer limit) {
        requireFilesystemProvider(pluginId, providerId, "read");
        ObjectNode params = objectMapper.createObjectNode();
        params.put("providerId", providerId);
        if (uri != null) {
            params.put("uri", uri);
        }
        if (limit != null) {
            params.put("limit", limit);
        }
        return activate(pluginId).invoke("filesystem/list", params);
    }

    public JsonNode filesystemRead(String pluginId, String providerId, String uri, Integer maxBytes) {
        requireFilesystemProvider(pluginId, providerId, "read");
        ObjectNode params = objectMapper.createObjectNode();
        params.put("providerId", providerId);
        params.put("uri", uri);
        if (maxBytes != null) {
            params.put("maxBytes", maxBytes);
        }
        return activate(pluginId).invoke("filesystem/read", params);
    }

    public JsonNode filesystemWrite(String pluginId, String providerId, String uri, String dataBase64) {
        requireFilesystemProvider(pluginId, providerId, "write");
        ObjectNode params = objectMapper.createObjectNode();
        params.put("providerId", providerId);
        params.put("uri", uri);
        params.put("dataBase64", dataBase64 != null ? dataBase64 : "");
        return activate(pluginId).invoke("filesystem/write", params);
    }

    public JsonNode filesystemDelete(String pluginId, String providerId, String uri) {
        requireFilesystemProvider(pluginId, providerId, "delete");
        ObjectNode params = objectMapper.createObjectNode();
        params.put("providerId", providerId);
        params.put("uri", uri);
        return activate(pluginId).invoke("filesystem/delete", params);
    }

    public JsonNode filesystemRename(String pluginId, String providerId, String fromUri, String toUri) {
        requireFilesystemProvider(pluginId, providerId, "rename");
        ObjectNode params = objectMapper.createObjectNode();
        params.put("providerId", providerId);
        params.put("fromUri", fromUri);
        params.put("toUri", toUri);
        return activate(pluginId).invoke("filesystem/rename", params);
    }

    public JsonNode filesystemCreateDirectory(String pluginId, String providerId, String uri) {
        requireFilesystemProvider(pluginId, providerId, "mkdir");
        ObjectNode params = objectMapper.createObjectNode();
        params.put("providerId", providerId);
        params.put("uri", uri);
        return activate(pluginId).invoke("filesystem/createDirectory", params);
    }

    public String workbenchContentSecurityPolicy(String pluginId) {
        InstalledCommunityPlugin plugin = installer.findInstalled(pluginId)
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
        List<String> permissions = plugin.manifest().permissions();
        List<String> origins = CommunityPluginCompatibilityGate.networkOrigins(permissions);
        boolean embed = CommunityPluginCompatibilityGate.allowsEmbed(permissions);
        StringBuilder connect = new StringBuilder("'self'");
        for (String origin : origins) {
            connect.append(' ').append(origin);
        }
        if (embed) {
            // Connection hosts vary (e.g. Kibana URL); allow https embeds + loopback for local stacks.
            connect.append(" https: http://127.0.0.1:* http://localhost:* http://[::1]:*");
        }
        String frameSrc = embed
                ? "frame-src 'self' https: http://127.0.0.1:* http://localhost:* http://[::1]:*; "
                : "frame-src 'none'; ";
        String formAction = embed
                ? "form-action 'self' https: http://127.0.0.1:* http://localhost:* http://[::1]:*; "
                : "form-action 'none'; ";
        // 'unsafe-eval' is required for workbench pre/post script runners
        // (ApiPost/Postman-style `new Function` sandboxes).
        // 'blob:' on script-src / worker-src lets packaged workbenches load
        // gzipped modules / editor workers via blob: URLs (single-file .dwp UI).
        // Network stays locked to 'self' + declared host.network origins (and https when host.embed);
        // DOM stays framed to 'self'.
        return "default-src 'none'; "
                + "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; "
                + "worker-src 'self' blob:; "
                + "style-src 'self' 'unsafe-inline'; "
                + "img-src 'self' data: blob: https:; "
                + "font-src 'self' data:; "
                + "connect-src " + connect + "; "
                + frameSrc
                + "object-src 'none'; "
                // Same-origin via desktop / Vite /api proxy; keep framing tight.
                // Note: frame-ancestors only applies on HTTP header responses (not <meta>).
                + "frame-ancestors 'self'; "
                + "base-uri 'none'; "
                + formAction;
    }

    private ObjectNode connectionParams(
            ConnectionConfig config,
            CommunityPluginContribution.ConnectionProvider provider) {
        ObjectNode params = objectMapper.createObjectNode();
        // Top-level connectionId for sidecars that key their pool by this field.
        // Nested connection.id remains the canonical copy (hostApi contract).
        if (config.getId() != null && !config.getId().isBlank()) {
            params.put("connectionId", config.getId());
        }
        ObjectNode providerNode = params.putObject("provider");
        providerNode.put("id", config.getPluginConnectionProvider());
        if (config.getPluginConnectionType() != null) {
            providerNode.put("connectionType", config.getPluginConnectionType());
        }
        ObjectNode connection = params.putObject("connection");
        connection.put("id", config.getId());
        connection.put("dbType", config.getDbType());
        connection.put("name", config.getName());
        connection.put("host", config.getHost());
        int port = parsePort(config.getPort());
        connection.put("port", port);
        String user = firstNonBlank(config.getUser(), config.getSshUser());
        if (user != null) {
            // Emit both keys: JDBC-shaped hosts use `user`; SSH (and older
            // packages) look for `username` first.
            connection.put("user", user);
            connection.put("username", user);
        }
        connection.put("password", config.getPassword() != null ? config.getPassword() : "");
        connection.put("database", config.getDatabase());
        connection.put("pluginId", config.getPluginId());
        connection.put("pluginConnectionProvider", config.getPluginConnectionProvider());
        // Secret classification is declarative: the standard `secrets` slot is
        // authoritative; manifest-declared secret bindings in advancedConfig are
        // the fallback for connections saved before the slot existed. The host
        // never guesses by key name and carries no dialect keys.
        java.util.Set<String> secretKeys = secretBindingKeys(provider);
        ObjectNode externalConfig = connection.putObject("external_config");
        ObjectNode connectionSecrets = connection.putObject("connection_secrets");
        if (config.getAdvancedConfig() != null && !config.getAdvancedConfig().isBlank()) {
            try {
                JsonNode advanced = objectMapper.readTree(config.getAdvancedConfig());
                if (advanced.isObject()) {
                    advanced.fields().forEachRemaining(entry ->
                            routeAdvancedKey(entry.getKey(), entry.getValue(), secretKeys, externalConfig, connectionSecrets));
                } else {
                    mergePropertiesAdvancedConfig(config.getAdvancedConfig(), secretKeys, externalConfig, connectionSecrets);
                }
            } catch (Exception e) {
                mergePropertiesAdvancedConfig(config.getAdvancedConfig(), secretKeys, externalConfig, connectionSecrets);
            }
        }
        mergeSecretsSlot(config.getSecrets(), connectionSecrets);
        if (user == null) {
            String fromConfig = firstNonBlank(
                    textField(externalConfig, "username"),
                    textField(externalConfig, "user")
            );
            if (fromConfig != null) {
                connection.put("user", fromConfig);
                connection.put("username", fromConfig);
            }
        }
        return params;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static String textField(ObjectNode object, String key) {
        if (object == null || key == null || !object.has(key) || object.get(key).isNull()) {
            return null;
        }
        String text = object.get(key).asText(null);
        return text != null && !text.isBlank() ? text.trim() : null;
    }

    /** Manifest field keys declared with a secret binding (`binding: "secret"` / password type). */
    private static java.util.Set<String> secretBindingKeys(CommunityPluginContribution.ConnectionProvider provider) {
        java.util.Set<String> keys = new java.util.HashSet<>();
        if (provider != null && provider.fields() != null) {
            for (CommunityPluginFormField field : provider.fields()) {
                if (field.key() == null) {
                    continue;
                }
                String binding = field.binding() != null ? field.binding() : "";
                if (binding.equals("secret") || binding.equals("password") || "password".equals(field.type())) {
                    keys.add(field.key());
                }
            }
        }
        return keys;
    }

    /** Merge the standard `secrets` slot (JSON map) into {@code connection_secrets}. */
    private void mergeSecretsSlot(String secretsJson, ObjectNode connectionSecrets) {
        if (secretsJson == null || secretsJson.isBlank()) {
            return;
        }
        try {
            JsonNode secrets = objectMapper.readTree(secretsJson);
            if (secrets.isObject()) {
                secrets.fields().forEachRemaining(entry -> {
                    if (!entry.getKey().isBlank() && !entry.getValue().isNull()) {
                        connectionSecrets.set(entry.getKey(), entry.getValue());
                    }
                });
            }
        } catch (Exception e) {
            throw new CommunityPluginException("Connection secrets must be a JSON object: " + e.getMessage(), e);
        }
    }

    private static void routeAdvancedKey(
            String key,
            JsonNode value,
            java.util.Set<String> secretKeys,
            ObjectNode externalConfig,
            ObjectNode connectionSecrets) {
        if (secretKeys.contains(key)) {
            connectionSecrets.set(key, value);
        } else {
            externalConfig.set(key, value);
        }
    }

    private void mergePropertiesAdvancedConfig(
            String raw,
            java.util.Set<String> secretKeys,
            ObjectNode externalConfig,
            ObjectNode connectionSecrets) {
        if (raw == null || raw.isBlank()) {
            return;
        }
        for (String line : raw.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            int eq = trimmed.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            String key = trimmed.substring(0, eq).trim();
            String value = trimmed.substring(eq + 1).trim();
            if (key.isEmpty()) {
                continue;
            }
            if (secretKeys.contains(key)) {
                connectionSecrets.put(key, value);
            } else {
                externalConfig.put(key, value);
            }
        }
    }

    public void sendBinary(String pluginId, String channel, byte[] data) {
        requireBinaryAccess(pluginId);
        activate(pluginId).sendBinary(channel, data);
    }

    public CommunityPluginSidecarSession requireActive(String pluginId) {
        return activate(pluginId);
    }

    public void requireBinaryAccess(String pluginId) {
        InstalledCommunityPlugin plugin = installer.findInstalled(pluginId)
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
        List<String> permissions = plugin.manifest().permissions();
        if (permissions == null || !permissions.contains("host.binary")) {
            throw new CommunityPluginException("Plugin '" + pluginId + "' lacks host.binary permission");
        }
        if (!CommunityPluginTransport.fromWire(plugin.manifest().entrypoints().backend().transport()).isFramed()) {
            throw new CommunityPluginException("host.binary requires stdio-framed transport");
        }
    }

    /**
     * Stream WebSocket gate: {@code host.binary} plugins get binary frames;
     * {@code host.events} plugins (including stdio-jsonl) get sidecar events.
     * Binary frames on a jsonl transport are still rejected by the session itself.
     */
    public void requireStreamAccess(String pluginId) {
        InstalledCommunityPlugin plugin = installer.findInstalled(pluginId)
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
        List<String> permissions = plugin.manifest().permissions();
        boolean allowed = permissions != null
                && (permissions.contains("host.binary") || permissions.contains("host.events"));
        if (!allowed) {
            throw new CommunityPluginException(
                    "Plugin '" + pluginId + "' lacks host.events / host.binary permission");
        }
    }

    private CommunityPluginContribution.ConnectionProvider resolveConnectionProvider(String pluginId, String providerId) {
        InstalledCommunityPlugin plugin = installer.findInstalled(pluginId)
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
        if (providerId == null || providerId.isBlank()) {
            throw new CommunityPluginException("pluginConnectionProvider is required");
        }
        Optional<CommunityPluginContribution.ConnectionProvider> found = plugin.manifest().contributions().stream()
                .filter(c -> c instanceof CommunityPluginContribution.ConnectionProvider)
                .map(c -> (CommunityPluginContribution.ConnectionProvider) c)
                .filter(c -> providerId.equals(c.id()))
                .findFirst();
        return found.orElseThrow(() -> new CommunityPluginException(
                "Connection provider '" + providerId + "' not found in plugin '" + pluginId + "'"));
    }

    private void requireFilesystemProvider(String pluginId, String providerId, String capability) {
        InstalledCommunityPlugin plugin = installer.findInstalled(pluginId)
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
        CommunityPluginContribution.FilesystemProvider provider = plugin.manifest().contributions().stream()
                .filter(c -> c instanceof CommunityPluginContribution.FilesystemProvider)
                .map(c -> (CommunityPluginContribution.FilesystemProvider) c)
                .filter(c -> providerId.equals(c.id()))
                .findFirst()
                .orElseThrow(() -> new CommunityPluginException(
                        "Filesystem provider '" + providerId + "' not found in plugin '" + pluginId + "'"));
        if (!provider.capabilities().contains(capability)) {
            throw new CommunityPluginException(
                    "Filesystem provider '" + providerId + "' does not declare capability '" + capability + "'");
        }
    }

    private static String requirePluginId(ConnectionConfig config) {
        if (config == null || config.getPluginId() == null || config.getPluginId().isBlank()) {
            throw new CommunityPluginException("pluginId is required");
        }
        return config.getPluginId();
    }

    private static int parsePort(String port) {
        if (port == null || port.isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(port.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
