package org.apache.datawise.backend.controller.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.config.CommunityPluginProperties;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.SqlVisibleConnectionDto;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInfoDto;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallPolicy;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallRequest;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallResponseDto;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginRepository;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginTrustKey;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.connector.api.support.ConnectionMapper;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginAiBridge;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginHost;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginSqlBridge;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginInstaller;
import org.springframework.beans.factory.ObjectProvider;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginMarketplace;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginPackageFetcher;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginReferenceGuard;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginRepositoryStore;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginTrustStore;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginUiTicketService;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginUiStorageService;
import org.apache.datawise.backend.server.communityplugin.WorkbenchHtmlBridgeInjector;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/community-plugins")
public class CommunityPluginController {

    private final CommunityPluginInstaller installer;
    private final CommunityPluginHost host;
    private final CommunityPluginMarketplace marketplace;
    private final CommunityPluginTrustStore trustStore;
    private final CommunityPluginRepositoryStore repositoryStore;
    private final ConnectionStore connectionStore;
    private final ConnectionExecutionContext connectionContext;
    private final UserAdminPolicy userAdminPolicy;
    private final CommunityPluginProperties communityPluginProperties;
    private final CommunityPluginUiTicketService uiTicketService;
    private final CommunityPluginUiStorageService uiStorageService;
    private final CommunityPluginSqlBridge sqlBridge;
    private final ObjectProvider<CommunityPluginAiBridge> aiBridge;

    public CommunityPluginController(
            CommunityPluginInstaller installer,
            CommunityPluginHost host,
            CommunityPluginMarketplace marketplace,
            CommunityPluginTrustStore trustStore,
            CommunityPluginRepositoryStore repositoryStore,
            ConnectionStore connectionStore,
            ConnectionExecutionContext connectionContext,
            UserAdminPolicy userAdminPolicy,
            CommunityPluginProperties communityPluginProperties,
            CommunityPluginUiTicketService uiTicketService,
            CommunityPluginUiStorageService uiStorageService,
            CommunityPluginSqlBridge sqlBridge,
            ObjectProvider<CommunityPluginAiBridge> aiBridge
    ) {
        this.installer = installer;
        this.host = host;
        this.marketplace = marketplace;
        this.trustStore = trustStore;
        this.repositoryStore = repositoryStore;
        this.connectionStore = connectionStore;
        this.connectionContext = connectionContext;
        this.userAdminPolicy = userAdminPolicy;
        this.communityPluginProperties = communityPluginProperties;
        this.uiTicketService = uiTicketService;
        this.uiStorageService = uiStorageService;
        this.sqlBridge = sqlBridge;
        this.aiBridge = aiBridge;
    }

    @GetMapping("/{pluginId}/sql/connections")
    public ApiResponse<List<SqlVisibleConnectionDto>> sqlConnections(@PathVariable String pluginId) {
        return ApiResponse.ok(sqlBridge.listConnections(pluginId));
    }

    @PostMapping("/{pluginId}/sql/execute")
    public ApiResponse<ExecuteSqlResult> sqlExecute(
            @PathVariable String pluginId,
            @RequestBody ExecuteSqlRequest request
    ) {
        return ApiResponse.ok(sqlBridge.executeReadonly(pluginId, request));
    }

    @GetMapping("/{pluginId}/ai/status")
    public ApiResponse<CommunityPluginAiBridge.AiStatusDto> aiStatus(@PathVariable String pluginId) {
        return ApiResponse.ok(requireAiBridge().status(pluginId));
    }

    @PostMapping("/{pluginId}/ai/chat")
    public ApiResponse<CommunityPluginAiBridge.AiChatDto> aiChat(
            @PathVariable String pluginId,
            @RequestBody CommunityPluginAiBridge.PluginAiChatRequest request
    ) {
        return ApiResponse.ok(requireAiBridge().chat(pluginId, request));
    }

    /**
     * host.ai SSE chat: events {@code delta} (string chunk) then {@code result}
     * (AiChatDto JSON). Used by the workbench bridge for token streaming.
     */
    @PostMapping(value = "/{pluginId}/ai/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter aiChatStream(
            @PathVariable String pluginId,
            @RequestBody CommunityPluginAiBridge.PluginAiChatRequest request
    ) {
        CommunityPluginAiBridge bridge = requireAiBridge();
        org.springframework.web.servlet.mvc.method.annotation.SseEmitter emitter =
                new org.springframework.web.servlet.mvc.method.annotation.SseEmitter(180_000L);
        org.apache.datawise.backend.security.UserContext.Snapshot userSnapshot =
                org.apache.datawise.backend.security.UserContext.snapshotOrNull();
        java.util.concurrent.CompletableFuture.runAsync(() ->
                org.apache.datawise.backend.security.UserContext.runAs(userSnapshot, () -> {
                    try {
                        CommunityPluginAiBridge.AiChatDto dto = bridge.chatStream(
                                pluginId,
                                request,
                                delta -> {
                                    try {
                                        emitter.send(
                                                org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                                        .event()
                                                        .name("delta")
                                                        .data(delta, MediaType.TEXT_PLAIN)
                                        );
                                    } catch (Exception sendEx) {
                                        throw new RuntimeException(sendEx);
                                    }
                                }
                        );
                        emitter.send(
                                org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                        .event()
                                        .name("result")
                                        .data(dto, MediaType.APPLICATION_JSON)
                        );
                        emitter.complete();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                            .event()
                                            .name("error")
                                            .data(ex.getMessage() == null ? "host AI stream failed" : ex.getMessage())
                            );
                        } catch (Exception ignored) {
                            // ignore secondary send failure
                        }
                        emitter.completeWithError(ex);
                    }
                })
        );
        return emitter;
    }

    private CommunityPluginAiBridge requireAiBridge() {
        CommunityPluginAiBridge bridge = aiBridge.getIfAvailable();
        if (bridge == null) {
            throw new CommunityPluginException("host AI is unavailable in this build");
        }
        return bridge;
    }

    @GetMapping
    public ApiResponse<List<CommunityPluginInfoDto>> list() {
        return ApiResponse.ok(installer.listInstalled().stream().map(CommunityPluginInfoDto::from).toList());
    }

    @GetMapping("/trust/keys")
    public ApiResponse<List<CommunityPluginTrustKey>> trustKeys() {
        userAdminPolicy.requireAdminUser();
        return ApiResponse.ok(trustStore.listKeys());
    }

    @PutMapping("/trust/keys")
    public ApiResponse<List<CommunityPluginTrustKey>> replaceTrustKeys(@RequestBody List<CommunityPluginTrustKey> keys) {
        userAdminPolicy.requireAdminUser();
        return ApiResponse.ok(trustStore.replaceKeys(keys));
    }

    @GetMapping("/repositories")
    public ApiResponse<List<CommunityPluginRepository>> repositories() {
        userAdminPolicy.requireAdminUser();
        return ApiResponse.ok(repositoryStore.list());
    }

    @PutMapping("/repositories")
    public ApiResponse<List<CommunityPluginRepository>> replaceRepositories(
            @RequestBody List<CommunityPluginRepository> repositories
    ) {
        userAdminPolicy.requireAdminUser();
        return ApiResponse.ok(repositoryStore.replace(repositories));
    }

    @GetMapping("/{pluginId}")
    public ApiResponse<CommunityPluginInfoDto> get(@PathVariable String pluginId) {
        return installer.findInstalled(pluginId)
                .map(CommunityPluginInfoDto::from)
                .map(ApiResponse::ok)
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
    }

    @PostMapping("/install")
    public ApiResponse<CommunityPluginInstallResponseDto> install(@RequestBody CommunityPluginInstallRequest request) {
        userAdminPolicy.requireAdminUser();
        if (request == null || request.path() == null || request.path().isBlank()) {
            throw new CommunityPluginException("path is required");
        }
        CommunityPluginInstallPolicy policy = resolveInstallPolicy(Boolean.TRUE.equals(request.allowUnsigned()));
        return ApiResponse.ok(CommunityPluginInstallResponseDto.from(
                installer.installFile(java.nio.file.Path.of(request.path()), policy)));
    }

    @PostMapping(value = "/install-upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<CommunityPluginInstallResponseDto> installUpload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "allowUnsigned", defaultValue = "false") boolean allowUnsigned
    ) {
        userAdminPolicy.requireAdminUser();
        if (file == null || file.isEmpty()) {
            throw new CommunityPluginException("file is required");
        }
        try {
            CommunityPluginInstallPolicy policy = resolveInstallPolicy(allowUnsigned);
            return ApiResponse.ok(CommunityPluginInstallResponseDto.from(
                    installer.installBytes(file.getBytes(), policy)));
        } catch (java.io.IOException e) {
            throw new CommunityPluginException("Failed to read uploaded package: " + e.getMessage(), e);
        }
    }

    @PostMapping("/install-url")
    public ApiResponse<CommunityPluginInstallResponseDto> installUrl(@RequestBody Map<String, Object> body) {
        userAdminPolicy.requireAdminUser();
        String url = body != null && body.get("url") != null ? String.valueOf(body.get("url")) : null;
        boolean allowUnsigned = body != null && Boolean.TRUE.equals(body.get("allowUnsigned"));
        CommunityPluginInstallPolicy policy = resolveInstallPolicy(allowUnsigned);
        byte[] bytes = CommunityPluginPackageFetcher.fetch(url);
        return ApiResponse.ok(CommunityPluginInstallResponseDto.from(installer.installBytes(bytes, policy)));
    }

    @GetMapping("/marketplace/catalogs")
    public ApiResponse<JsonNode> marketplaceCatalogs() {
        return ApiResponse.ok(marketplace.catalogs());
    }

    @PostMapping("/marketplace/install")
    public ApiResponse<CommunityPluginInstallResponseDto> marketplaceInstall(@RequestBody Map<String, String> body) {
        userAdminPolicy.requireAdminUser();
        String catalogId = body != null ? body.get("catalogId") : null;
        String pluginId = body != null ? body.get("pluginId") : null;
        return ApiResponse.ok(CommunityPluginInstallResponseDto.from(marketplace.install(catalogId, pluginId)));
    }

    @PostMapping("/rollback")
    public ApiResponse<CommunityPluginInstallResponseDto> rollback(@RequestBody Map<String, String> body) {
        userAdminPolicy.requireAdminUser();
        String pluginId = body != null ? body.get("pluginId") : null;
        if (pluginId == null || pluginId.isBlank()) {
            throw new CommunityPluginException("pluginId is required");
        }
        host.stop(pluginId);
        return ApiResponse.ok(CommunityPluginInstallResponseDto.from(installer.rollback(pluginId)));
    }

    @DeleteMapping("/{pluginId}")
    public ApiResponse<Map<String, Object>> uninstall(@PathVariable String pluginId) {
        userAdminPolicy.requireAdminUser();
        CommunityPluginReferenceGuard.refuseIfReferenced(pluginId, connectionStore.findAllConnections());
        host.stop(pluginId);
        installer.uninstall(pluginId);
        return ApiResponse.ok(Map.of("pluginId", pluginId, "uninstalled", true));
    }

    @PostMapping("/{pluginId}/activate")
    public ApiResponse<Map<String, Object>> activate(@PathVariable String pluginId) {
        userAdminPolicy.requireAdminUser();
        host.activate(pluginId);
        return ApiResponse.ok(Map.of("pluginId", pluginId, "active", true));
    }

    @PostMapping("/{pluginId}/stop")
    public ApiResponse<Map<String, Object>> stop(@PathVariable String pluginId) {
        userAdminPolicy.requireAdminUser();
        host.stop(pluginId);
        return ApiResponse.ok(Map.of("pluginId", pluginId, "active", false));
    }

    /**
     * UI storage backing {@code datawisePlugin.storage} (hostApi 1.2). Workbench
     * iframes run at an opaque origin, so UI persistence lives server-side in the
     * plugin data dir instead of localStorage — scoped to the calling user.
     */
    @GetMapping("/{pluginId}/storage")
    public ApiResponse<Map<String, Object>> storageGet(@PathVariable String pluginId) {
        return ApiResponse.ok(Map.of("values", uiStorageService.getAll(pluginId, requireStorageUser())));
    }

    @PutMapping("/{pluginId}/storage")
    public ApiResponse<Map<String, Object>> storagePut(
            @PathVariable String pluginId,
            @RequestBody Map<String, Object> body
    ) {
        if (body == null || !(body.get("entries") instanceof Map<?, ?> rawEntries)) {
            throw new CommunityPluginException("entries object is required");
        }
        Map<String, String> entries = new java.util.LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawEntries.entrySet()) {
            if (entry.getKey() == null) {
                continue;
            }
            entries.put(String.valueOf(entry.getKey()),
                    entry.getValue() == null ? null : String.valueOf(entry.getValue()));
        }
        return ApiResponse.ok(Map.of("values", uiStorageService.putAll(pluginId, requireStorageUser(), entries)));
    }

    private static Long requireStorageUser() {
        Long userId = UserContext.getUserId();
        if (userId == null) {
            throw new UnauthorizedException();
        }
        return userId;
    }

    @PostMapping("/{pluginId}/invoke")
    public ApiResponse<JsonNode> invoke(@PathVariable String pluginId, @RequestBody Map<String, Object> body) {
        String method = body != null && body.get("method") != null ? String.valueOf(body.get("method")) : null;
        if (method == null || method.isBlank()) {
            throw new CommunityPluginException("method is required");
        }
        JsonNode params = body.get("params") != null
                ? new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(body.get("params"))
                : null;
        return ApiResponse.ok(host.invoke(pluginId, method, params));
    }

    @PostMapping("/{pluginId}/notify")
    public ApiResponse<Map<String, Object>> notify(@PathVariable String pluginId, @RequestBody Map<String, Object> body) {
        String method = body != null && body.get("method") != null ? String.valueOf(body.get("method")) : null;
        if (method == null || method.isBlank()) {
            throw new CommunityPluginException("method is required");
        }
        JsonNode params = body.get("params") != null
                ? new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(body.get("params"))
                : null;
        host.notify(pluginId, method, params);
        return ApiResponse.ok(Map.of("ok", true));
    }

    @PostMapping("/connection/test")
    public ApiResponse<JsonNode> testConnection(@RequestBody ConnectionConfig config) {
        return ApiResponse.ok(host.testConnection(resolveStoredConnection(config)));
    }

    @PostMapping("/connection/connect")
    public ApiResponse<JsonNode> connect(@RequestBody ConnectionConfig config) {
        return ApiResponse.ok(host.connect(resolveStoredConnection(config)));
    }

    @PostMapping("/connection/disconnect")
    public ApiResponse<JsonNode> disconnect(@RequestBody ConnectionConfig config) {
        return ApiResponse.ok(host.disconnect(resolveStoredConnection(config)));
    }

    @PostMapping("/connection/action")
    public ApiResponse<JsonNode> connectionAction(@RequestBody Map<String, Object> body) {
        if (body == null || body.get("connection") == null) {
            throw new CommunityPluginException("connection is required");
        }
        ConnectionConfig config = objectMapper().convertValue(body.get("connection"), ConnectionConfig.class);
        String actionId = stringField(body, "actionId");
        JsonNode actionParams = body.get("actionParams") != null
                ? objectMapper().valueToTree(body.get("actionParams"))
                : null;
        return ApiResponse.ok(host.connectionAction(resolveStoredConnection(config), actionId, actionParams));
    }

    /**
     * Saved connections: prefer the form/request body so unsaved edits and
     * re-entered passwords (e.g. after master-key decrypt failure cleared the
     * store copy) reach {@code connection/test|connect}. Backfill blank
     * credentials from the store when the browser omits them (partial host
     * context). Unsaved form tests (no id) still use the request body as-is.
     */
    private ConnectionConfig resolveStoredConnection(ConnectionConfig incoming) {
        if (incoming == null) {
            throw new CommunityPluginException("connection is required");
        }
        String id = incoming.getId();
        if (id == null || id.isBlank()) {
            return incoming;
        }
        try {
            ConnectionConfig stored = ConnectionMapper.toDto(
                    connectionContext.requireConnectionForCurrentUser(
                            id.trim(),
                            "Connection not found"
                    ).entity()
            );
            return mergeFormOverStored(incoming, stored);
        } catch (IllegalArgumentException ex) {
            // Fall back to the request body (e.g. ephemeral / not yet visible).
            return incoming;
        }
    }

    /**
     * Form wins when a field is non-blank; store fills omissions so tree/host
     * contexts that strip secrets still dial correctly.
     */
    static ConnectionConfig mergeFormOverStored(ConnectionConfig form, ConnectionConfig stored) {
        if (form == null) {
            return stored;
        }
        if (stored == null) {
            return form;
        }
        if (isBlank(form.getPassword())) {
            form.setPassword(stored.getPassword());
        }
        if (isBlank(form.getUser())) {
            form.setUser(stored.getUser());
        }
        if (isBlank(form.getSshPassword())) {
            form.setSshPassword(stored.getSshPassword());
        }
        if (isBlank(form.getSshPrivateKey())) {
            form.setSshPrivateKey(stored.getSshPrivateKey());
        }
        if (isBlank(form.getSshPassphrase())) {
            form.setSshPassphrase(stored.getSshPassphrase());
        }
        if (isBlank(form.getJumpPrivateKey())) {
            form.setJumpPrivateKey(stored.getJumpPrivateKey());
        }
        if (isBlank(form.getJumpPassphrase())) {
            form.setJumpPassphrase(stored.getJumpPassphrase());
        }
        if (isBlank(form.getHost())) {
            form.setHost(stored.getHost());
        }
        if (isBlank(form.getPort())) {
            form.setPort(stored.getPort());
        }
        if (isBlank(form.getName())) {
            form.setName(stored.getName());
        }
        if (isBlank(form.getAuth())) {
            form.setAuth(stored.getAuth());
        }
        if (isBlank(form.getAdvancedConfig())) {
            form.setAdvancedConfig(stored.getAdvancedConfig());
        }
        if (isBlank(form.getSecrets())) {
            form.setSecrets(stored.getSecrets());
        } else if (!isBlank(stored.getSecrets())) {
            form.setSecrets(mergeJsonObjectsPreferNonBlank(form.getSecrets(), stored.getSecrets()));
        }
        if (isBlank(form.getPluginId())) {
            form.setPluginId(stored.getPluginId());
        }
        if (isBlank(form.getPluginConnectionProvider())) {
            form.setPluginConnectionProvider(stored.getPluginConnectionProvider());
        }
        if (isBlank(form.getPluginConnectionType())) {
            form.setPluginConnectionType(stored.getPluginConnectionType());
        }
        if (isBlank(form.getDbType())) {
            form.setDbType(stored.getDbType());
        }
        return form;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /** Prefer left (form) non-blank values; fill missing/blank keys from right (store). */
    private static String mergeJsonObjectsPreferNonBlank(String leftJson, String rightJson) {
        try {
            var om = objectMapper();
            JsonNode left = om.readTree(leftJson);
            JsonNode right = om.readTree(rightJson);
            if (!left.isObject() || !right.isObject()) {
                return leftJson;
            }
            var merged = ((com.fasterxml.jackson.databind.node.ObjectNode) right).deepCopy();
            left.fields().forEachRemaining(entry -> {
                JsonNode value = entry.getValue();
                if (value == null || value.isNull()) {
                    return;
                }
                if (value.isTextual() && value.asText().isBlank()) {
                    return;
                }
                merged.set(entry.getKey(), value);
            });
            return om.writeValueAsString(merged);
        } catch (Exception ignored) {
            return leftJson;
        }
    }

    @PostMapping("/{pluginId}/filesystem/list")
    public ApiResponse<JsonNode> filesystemList(
            @PathVariable String pluginId,
            @RequestBody Map<String, Object> body
    ) {
        String providerId = stringField(body, "providerId");
        String uri = optionalString(body, "uri");
        Integer limit = body != null && body.get("limit") instanceof Number n ? n.intValue() : null;
        return ApiResponse.ok(host.filesystemList(pluginId, providerId, uri, limit));
    }

    @PostMapping("/{pluginId}/filesystem/read")
    public ApiResponse<JsonNode> filesystemRead(
            @PathVariable String pluginId,
            @RequestBody Map<String, Object> body
    ) {
        String providerId = stringField(body, "providerId");
        String uri = stringField(body, "uri");
        Integer maxBytes = body != null && body.get("maxBytes") instanceof Number n ? n.intValue() : null;
        return ApiResponse.ok(host.filesystemRead(pluginId, providerId, uri, maxBytes));
    }

    @PostMapping("/{pluginId}/filesystem/write")
    public ApiResponse<JsonNode> filesystemWrite(
            @PathVariable String pluginId,
            @RequestBody Map<String, Object> body
    ) {
        String providerId = stringField(body, "providerId");
        String uri = stringField(body, "uri");
        String dataBase64 = optionalString(body, "dataBase64");
        return ApiResponse.ok(host.filesystemWrite(pluginId, providerId, uri, dataBase64));
    }

    @PostMapping("/{pluginId}/filesystem/delete")
    public ApiResponse<JsonNode> filesystemDelete(
            @PathVariable String pluginId,
            @RequestBody Map<String, Object> body
    ) {
        String providerId = stringField(body, "providerId");
        String uri = stringField(body, "uri");
        return ApiResponse.ok(host.filesystemDelete(pluginId, providerId, uri));
    }

    @PostMapping("/{pluginId}/filesystem/rename")
    public ApiResponse<JsonNode> filesystemRename(
            @PathVariable String pluginId,
            @RequestBody Map<String, Object> body
    ) {
        String providerId = stringField(body, "providerId");
        String fromUri = stringField(body, "fromUri");
        String toUri = stringField(body, "toUri");
        return ApiResponse.ok(host.filesystemRename(pluginId, providerId, fromUri, toUri));
    }

    @PostMapping("/{pluginId}/filesystem/createDirectory")
    public ApiResponse<JsonNode> filesystemCreateDirectory(
            @PathVariable String pluginId,
            @RequestBody Map<String, Object> body
    ) {
        String providerId = stringField(body, "providerId");
        String uri = stringField(body, "uri");
        return ApiResponse.ok(host.filesystemCreateDirectory(pluginId, providerId, uri));
    }

    /**
     * Issues a short-lived UI bootstrap ticket for the authenticated session.
     * The workbench iframe should load {@code /ui/**} with {@code ?dwUiTicket=} instead of the raw session id.
     */
    @PostMapping("/{pluginId}/ui-ticket")
    public ApiResponse<Map<String, Object>> issueUiTicket(@PathVariable String pluginId) {
        if (pluginId == null || pluginId.isBlank()) {
            throw new CommunityPluginException("pluginId is required");
        }
        String sessionId = UserContext.getSessionId();
        if (sessionId == null || sessionId.isBlank() || sessionId.startsWith("api-token:")) {
            throw new UnauthorizedException();
        }
        // Ensure plugin exists / is installed before minting a ticket.
        installer.findInstalled(pluginId.trim())
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
        CommunityPluginUiTicketService.IssuedTicket issued = uiTicketService.issue(sessionId, pluginId.trim());
        return ApiResponse.ok(Map.of(
                "ticket", issued.ticket(),
                "expiresInSec", issued.expiresInSec()
        ));
    }

    @GetMapping("/{pluginId}/ui/**")
    public ResponseEntity<Resource> uiAsset(
            @PathVariable String pluginId,
            jakarta.servlet.http.HttpServletRequest request
    ) {
        var installed = installer.findInstalled(pluginId)
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
        String prefix = "/api/community-plugins/" + pluginId + "/ui/";
        String pathInfo = request.getRequestURI();
        int idx = pathInfo.indexOf(prefix);
        String relative = idx >= 0 ? pathInfo.substring(idx + prefix.length()) : "";
        if (relative.isBlank()) {
            relative = installed.manifest().entrypoints() != null
                    && installed.manifest().entrypoints().ui() != null
                    && installed.manifest().entrypoints().ui().entry() != null
                    ? installed.manifest().entrypoints().ui().entry().replaceFirst("^ui/", "")
                    : "index.html";
        }
        Path root = installed.path().resolve("ui").normalize();
        Path file = root.resolve(relative).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            throw new CommunityPluginException("UI asset not found: " + relative);
        }
        String contentType = probeContentType(file);
        Resource body;
        if (contentType.startsWith("text/html")) {
            try {
                byte[] raw = Files.readAllBytes(file);
                byte[] injected = WorkbenchHtmlBridgeInjector.injectIntoHtml(raw);
                body = new ByteArrayResource(injected) {
                    @Override
                    public String getFilename() {
                        return file.getFileName().toString();
                    }
                };
            } catch (Exception e) {
                throw new CommunityPluginException("Failed to serve UI asset: " + relative);
            }
        } else {
            body = new FileSystemResource(file);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                // CORS for opaque-origin (Origin: null) module/CSS fetches is configured once
                // in WebConfig for /ui/** — do not set Access-Control-Allow-Origin here or
                // browsers reject the duplicated "null, null" value.
                .header("Cross-Origin-Resource-Policy", "cross-origin")
                .header("Content-Security-Policy", host.workbenchContentSecurityPolicy(pluginId))
                .contentType(MediaType.parseMediaType(contentType))
                .body(body);
    }

    /**
     * Serves package-root assets such as {@code assets/plugin.svg} for the plugin center icon.
     * Only paths under {@code assets/} with image extensions are allowed.
     */
    @GetMapping("/{pluginId}/package/**")
    public ResponseEntity<Resource> packageAsset(
            @PathVariable String pluginId,
            jakarta.servlet.http.HttpServletRequest request
    ) {
        var installed = installer.findInstalled(pluginId)
                .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' is not installed"));
        String decodedUri = java.net.URLDecoder.decode(
                request.getRequestURI(),
                java.nio.charset.StandardCharsets.UTF_8
        );
        String marker = "/package/";
        int idx = decodedUri.indexOf(marker);
        String relative = idx >= 0 ? decodedUri.substring(idx + marker.length()) : "";
        relative = relative.replace('\\', '/').replaceAll("^/+", "");
        if (relative.isBlank() || relative.contains("..") || !relative.startsWith("assets/")) {
            throw new CommunityPluginException("Package asset not found: " + relative);
        }
        String lower = relative.toLowerCase();
        if (!(lower.endsWith(".svg")
                || lower.endsWith(".png")
                || lower.endsWith(".jpg")
                || lower.endsWith(".jpeg")
                || lower.endsWith(".webp")
                || lower.endsWith(".ico")
                || lower.endsWith(".gif"))) {
            throw new CommunityPluginException("Package asset type not allowed: " + relative);
        }
        Path root = installed.path().normalize();
        Path file = root.resolve(relative).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            throw new CommunityPluginException("Package asset not found: " + relative);
        }
        return ResponseEntity.ok()
                // Icons are edited during plugin development; never let browsers keep a stale SVG.
                .header(HttpHeaders.CACHE_CONTROL, "no-store, no-cache, must-revalidate")
                .header(HttpHeaders.PRAGMA, "no-cache")
                .contentType(MediaType.parseMediaType(probeContentType(file)))
                .body(new FileSystemResource(file));
    }

    private CommunityPluginInstallPolicy resolveInstallPolicy(boolean clientAllowUnsigned) {
        if (!clientAllowUnsigned) {
            return CommunityPluginInstallPolicy.SIGNED;
        }
        if (!communityPluginProperties.isAllowUnsigned()) {
            throw new CommunityPluginException(
                    "Unsigned community plugin installs are disabled on this server "
                            + "(set datawise.community-plugin.allow-unsigned=true only for trusted local development)"
            );
        }
        return CommunityPluginInstallPolicy.DEVELOPMENT;
    }

    private static com.fasterxml.jackson.databind.ObjectMapper objectMapper() {
        return new com.fasterxml.jackson.databind.ObjectMapper();
    }

    private static String stringField(Map<String, Object> body, String key) {
        String value = optionalString(body, key);
        if (value == null) {
            throw new CommunityPluginException(key + " is required");
        }
        return value;
    }

    private static String optionalString(Map<String, Object> body, String key) {
        if (body == null || body.get(key) == null) {
            return null;
        }
        String value = String.valueOf(body.get(key));
        if (value.isBlank() || "null".equals(value)) {
            return null;
        }
        return value;
    }

    private static String probeContentType(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js")) return "text/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".json")) return "application/json";
        try {
            String probed = Files.probeContentType(file);
            return probed != null ? probed : "application/octet-stream";
        } catch (Exception e) {
            return "application/octet-stream";
        }
    }
}
