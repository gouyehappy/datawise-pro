package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.app.AppConfigSections;
import org.apache.datawise.backend.configstore.io.ConfigFileSupport;
import org.apache.datawise.backend.security.AppConfigSecrets;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.apache.datawise.backend.common.support.XmlConfigSupport;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 按注册用户隔离的 app.xml（{@code config/users/{userId}/app.xml}）。
 * 明细配置（AI / explorer / window / localFiles / workspace tabs）写入独立 JSON。
 */
@Service
public class UserAppConfigStore {

    private static final Logger log = LoggerFactory.getLogger(UserAppConfigStore.class);

    private final ConfigDirectoryService configDirectory;
    private final AppConfigStore appConfigStore;
    private final ObjectMapper objectMapper;
    private final SecretValueCodec secretValueCodec;

    public UserAppConfigStore(
                              ConfigDirectoryService configDirectory,
                              AppConfigStore appConfigStore,
                              ObjectMapper objectMapper,
                              SecretValueCodec secretValueCodec) {
        this.configDirectory = configDirectory;
        this.appConfigStore = appConfigStore;
        this.objectMapper = objectMapper;
        this.secretValueCodec = secretValueCodec;
    }

    public Optional<Map<String, Object>> readAppConfig(long userId) {
        Path path = userConfigPath(userId);
        if (!XmlConfigSupport.isRegularFile(path)) {
            return migrateFromGlobalIfNeeded(userId);
        }
        Optional<Map<String, Object>> parsed = parseAppConfig(path);
        if (parsed.isPresent()) {
            return parsed;
        }
        quarantineCorruptConfig(path, userId);
        return migrateFromGlobalIfNeeded(userId);
    }

    public void writeAppConfig(long userId, Map<String, Object> config) throws Exception {
        // Lift any leftover detail still on disk before we overwrite app.xml with a summary.
        migrateAllExternalSectionsFromDiskIfNeeded(userId);
        configDirectory.ensureExists();
        Path path = userConfigPath(userId);
        Path parent = path.getParent();
        if (parent != null) {
            java.nio.file.Files.createDirectories(parent);
        }
        Map<String, Object> toWrite = AppConfigSections.deepCopy(config);
        peelIncomingExternalSections(userId, toWrite);
        stripExternalDetailSections(toWrite);
        writeAppConfigDocument(path, toWrite);
    }

    /** Write app.xml without migration / peel (internal). */
    private void writeAppConfigDocument(Path path, Map<String, Object> toWrite) throws Exception {
        Document document = XmlConfigSupport.newDocument();
        AppConfigSections.writeToDocument(objectMapper, document, toWrite);
        XmlConfigSupport.writeDocument(path, document);
    }

    /**
     * Open workspace session (tabs / groups). Stored at
     * {@code users/{id}/tenants/{tenantId}/workspace-session.json}.
     */
    public Optional<Map<String, Object>> readWorkspaceSession(long userId) {
        Path path = workspaceSessionPath(userId);
        if (ConfigFileSupport.exists(path)) {
            try {
                Map<String, Object> payload = objectMapper.readValue(
                        path.toFile(),
                        new com.fasterxml.jackson.core.type.TypeReference<>() {
                        });
                return Optional.ofNullable(payload);
            } catch (Exception ex) {
                ExceptionLogging.warn(log, "config.workspaceSession.parse path=" + path, ex);
                quarantineCorruptConfig(path, userId);
            }
        }
        return migrateWorkspaceSessionFromAppConfig(userId);
    }

    public void writeWorkspaceSession(long userId, Map<String, Object> payload) throws Exception {
        configDirectory.ensureExists();
        Path path = workspaceSessionPath(userId);
        Map<String, Object> toWrite = payload != null ? new LinkedHashMap<>(payload) : new LinkedHashMap<>();
        if (!toWrite.containsKey("tabs")) {
            toWrite.put("tabs", List.of());
        }
        if (!toWrite.containsKey("tabGroups")) {
            toWrite.put("tabGroups", List.of());
        }
        if (!toWrite.containsKey("activeTabIndex")) {
            toWrite.put("activeTabIndex", 0);
        }
        ConfigFileSupport.writeJson(path, objectMapper, toWrite);
    }

    /**
     * AI preferences ({@code users/{id}/ai-preferences.json}).
     */
    public Optional<Map<String, Object>> readAiPreferences(long userId) {
        Optional<Map<String, Object>> fromFile = readAiPreferencesFile(userId);
        if (fromFile.isPresent()) {
            return fromFile;
        }
        return migrateAiPreferencesFromAppConfig(userId);
    }

    public void writeAiPreferences(long userId, Map<String, Object> payload) throws Exception {
        configDirectory.ensureExists();
        Path path = aiPreferencesPath(userId);
        Map<String, Object> toWrite = payload != null ? AppConfigSections.deepCopy(payload) : new LinkedHashMap<>();
        readAiPreferencesFile(userId).ifPresent(existing -> AppConfigSecrets.preserveAiPreferencesSecrets(toWrite, existing));
        AppConfigSecrets.encryptAiPreferences(toWrite, secretValueCodec);
        ConfigFileSupport.writeJson(path, objectMapper, toWrite);
    }

    /** File-only read (no migrate) — used when preserving secrets on write. */
    private Optional<Map<String, Object>> readAiPreferencesFile(long userId) {
        Path path = aiPreferencesPath(userId);
        if (!ConfigFileSupport.exists(path)) {
            return Optional.empty();
        }
        try {
            Map<String, Object> payload = objectMapper.readValue(
                    path.toFile(),
                    new com.fasterxml.jackson.core.type.TypeReference<>() {
                    });
            if (payload != null) {
                AppConfigSecrets.decryptAiPreferences(payload, secretValueCodec);
            }
            return Optional.ofNullable(payload);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.aiPreferences.parse path=" + path, ex);
            return Optional.empty();
        }
    }

    public Optional<Map<String, Object>> readExplorerUi(long userId) {
        return readJsonSectionOrMigrate(userId, explorerUiPath(userId), "explorer", "explorerUi");
    }

    public void writeExplorerUi(long userId, Map<String, Object> payload) throws Exception {
        writeJsonSection(explorerUiPath(userId), payload);
    }

    public Optional<Map<String, Object>> readWindow(long userId) {
        return readJsonSectionOrMigrate(userId, windowPath(userId), "window", "window");
    }

    public void writeWindow(long userId, Map<String, Object> payload) throws Exception {
        writeJsonSection(windowPath(userId), payload);
    }

    public Optional<Map<String, Object>> readLocalFiles(long userId) {
        return readJsonSectionOrMigrate(userId, localFilesPath(userId), "localFiles", "localFiles");
    }

    public void writeLocalFiles(long userId, Map<String, Object> payload) throws Exception {
        writeJsonSection(localFilesPath(userId), payload);
    }

    /**
     * Returns app.xml content with detail sections stripped (for GET /api/config/app).
     */
    public Optional<Map<String, Object>> readAppConfigSummary(long userId) {
        migrateAllExternalSectionsFromDiskIfNeeded(userId);
        Optional<Map<String, Object>> full = readAppConfig(userId);
        if (full.isEmpty()) {
            return Optional.empty();
        }
        Map<String, Object> summary = AppConfigSections.deepCopy(full.get());
        stripExternalDetailSections(summary);
        return Optional.of(summary);
    }

    /**
     * Before overwriting app.xml, copy any still-embedded detail sections into their JSON files.
     */
    private void migrateAllExternalSectionsFromDiskIfNeeded(long userId) {
        Path path = userConfigPath(userId);
        Optional<Map<String, Object>> parsed = parseAppConfig(path);
        if (parsed.isEmpty()) {
            return;
        }
        Map<String, Object> app = parsed.get();
        boolean lifted = false;
        lifted |= liftSectionToJsonFile(userId, app, "ai", aiPreferencesPath(userId), true);
        lifted |= liftSectionToJsonFile(userId, app, "explorer", explorerUiPath(userId), false);
        lifted |= liftSectionToJsonFile(userId, app, "window", windowPath(userId), false);
        lifted |= liftSectionToJsonFile(userId, app, "localFiles", localFilesPath(userId), false);
        lifted |= liftWorkspaceSessionIfNeeded(userId, app);
        if (!lifted) {
            return;
        }
        try {
            Map<String, Object> cleaned = AppConfigSections.deepCopy(app);
            stripExternalDetailSections(cleaned);
            Path parent = path.getParent();
            if (parent != null) {
                java.nio.file.Files.createDirectories(parent);
            }
            writeAppConfigDocument(path, cleaned);
            log.info("Stripped migrated detail sections from app.xml for user {}", userId);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.app.stripAfterMigrate userId=" + userId, ex);
        }
    }

    /**
     * If a legacy client still PUTs detail sections inside /app, peel them into JSON files.
     */
    private void peelIncomingExternalSections(long userId, Map<String, Object> config) {
        liftSectionToJsonFile(userId, config, "ai", aiPreferencesPath(userId), true);
        liftSectionToJsonFile(userId, config, "explorer", explorerUiPath(userId), false);
        liftSectionToJsonFile(userId, config, "window", windowPath(userId), false);
        liftSectionToJsonFile(userId, config, "localFiles", localFilesPath(userId), false);
        liftWorkspaceSessionIfNeeded(userId, config);
    }

    @SuppressWarnings("unchecked")
    private boolean liftSectionToJsonFile(
                                          long userId,
                                          Map<String, Object> source,
                                          String sectionKey,
                                          Path targetPath,
                                          boolean aiSecrets) {
        Object raw = source.get(sectionKey);
        if (!(raw instanceof Map<?, ?> map) || map.isEmpty()) {
            return false;
        }
        if (ConfigFileSupport.exists(targetPath)) {
            return false;
        }
        Map<String, Object> section = AppConfigSections.deepCopy((Map<String, Object>) map);
        try {
            if (aiSecrets) {
                writeAiPreferences(userId, section);
            } else {
                writeJsonSection(targetPath, section);
            }
            log.info("Lifted {} out of app config for user {}", sectionKey, userId);
            return true;
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.lift." + sectionKey + " userId=" + userId, ex);
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    private boolean liftWorkspaceSessionIfNeeded(long userId, Map<String, Object> source) {
        if (ConfigFileSupport.exists(workspaceSessionPath(userId))) {
            return false;
        }
        Object workspaceRaw = source.get("workspace");
        if (!(workspaceRaw instanceof Map<?, ?> workspaceMap)) {
            return false;
        }
        Object tabsRaw = workspaceMap.get("tabs");
        if (!(tabsRaw instanceof List<?> tabs) || tabs.isEmpty()) {
            return false;
        }
        Map<String, Object> session = new LinkedHashMap<>();
        session.put("tabs", tabs);
        Object active = workspaceMap.get("activeTabIndex");
        session.put("activeTabIndex", active instanceof Number number ? number.intValue() : 0);
        Object groups = workspaceMap.get("tabGroups");
        session.put("tabGroups", groups instanceof List<?> list ? list : List.of());
        try {
            writeWorkspaceSession(userId, session);
            log.info("Lifted workspace session out of app config for user {}", userId);
            return true;
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.lift.workspaceSession userId=" + userId, ex);
            return false;
        }
    }

    private Optional<Map<String, Object>> migrateWorkspaceSessionFromAppConfig(long userId) {
        Optional<Map<String, Object>> app = readAppConfig(userId);
        if (app.isEmpty()) {
            return Optional.empty();
        }
        if (!liftWorkspaceSessionIfNeeded(userId, app.get())) {
            return Optional.empty();
        }
        return readWorkspaceSession(userId);
    }

    private Optional<Map<String, Object>> migrateAiPreferencesFromAppConfig(long userId) {
        Optional<Map<String, Object>> app = readAppConfig(userId);
        if (app.isEmpty()) {
            return Optional.empty();
        }
        if (!liftSectionToJsonFile(userId, app.get(), "ai", aiPreferencesPath(userId), true)) {
            return Optional.empty();
        }
        return readAiPreferencesFile(userId);
    }

    private Optional<Map<String, Object>> readJsonSectionOrMigrate(
                                                                   long userId,
                                                                   Path path,
                                                                   String appSectionKey,
                                                                   String logLabel) {
        if (ConfigFileSupport.exists(path)) {
            try {
                Map<String, Object> payload = objectMapper.readValue(
                        path.toFile(),
                        new com.fasterxml.jackson.core.type.TypeReference<>() {
                        });
                return Optional.ofNullable(payload);
            } catch (Exception ex) {
                ExceptionLogging.warn(log, "config." + logLabel + ".parse path=" + path, ex);
                quarantineCorruptConfig(path, userId);
            }
        }
        Optional<Map<String, Object>> app = readAppConfig(userId);
        if (app.isEmpty()) {
            return Optional.empty();
        }
        if (!liftSectionToJsonFile(userId, app.get(), appSectionKey, path, false)) {
            return Optional.empty();
        }
        try {
            Map<String, Object> payload = objectMapper.readValue(
                    path.toFile(),
                    new com.fasterxml.jackson.core.type.TypeReference<>() {
                    });
            return Optional.ofNullable(payload);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config." + logLabel + ".reparse path=" + path, ex);
            return Optional.empty();
        }
    }

    private void writeJsonSection(Path path, Map<String, Object> payload) throws Exception {
        configDirectory.ensureExists();
        Map<String, Object> toWrite = payload != null ? new LinkedHashMap<>(payload) : new LinkedHashMap<>();
        ConfigFileSupport.writeJson(path, objectMapper, toWrite);
    }

    /**
     * Remove heavy / independently-stored sections so app.xml stays a summary of prefs.
     */
    static void stripExternalDetailSections(Map<String, Object> config) {
        if (config == null) {
            return;
        }
        stripWorkspaceSessionFields(config);
        config.remove("ai");
        config.remove("explorer");
        config.remove("window");
        config.remove("localFiles");
        config.remove("sqlEditorShortcutsShared");
        config.remove("sqlEditorShortcuts");
    }

    @SuppressWarnings("unchecked")
    private static void stripWorkspaceSessionFields(Map<String, Object> config) {
        Object workspaceRaw = config.get("workspace");
        if (!(workspaceRaw instanceof Map<?, ?>)) {
            return;
        }
        Map<String, Object> workspace = (Map<String, Object>) workspaceRaw;
        workspace.remove("tabs");
        workspace.remove("activeTabIndex");
        workspace.remove("tabGroups");
    }

    private Path workspaceSessionPath(long userId) {
        return configDirectory.resolve(
                TenantScopedConfigSupport.ensureUserTenantFile(
                        configDirectory, userId, ConfigPaths.WORKSPACE_SESSION));
    }

    private Path aiPreferencesPath(long userId) {
        return configDirectory.resolve(ConfigPaths.userAiPreferences(userId));
    }

    private Path explorerUiPath(long userId) {
        return configDirectory.resolve(
                TenantScopedConfigSupport.ensureUserTenantFile(
                        configDirectory, userId, ConfigPaths.EXPLORER_UI));
    }

    private Path windowPath(long userId) {
        return configDirectory.resolve(ConfigPaths.userWindow(userId));
    }

    private Path localFilesPath(long userId) {
        return configDirectory.resolve(ConfigPaths.userLocalFiles(userId));
    }

    public String readAppConfigXml(long userId) throws Exception {
        Path path = userConfigPath(userId);
        if (!XmlConfigSupport.isRegularFile(path)) {
            Optional<Map<String, Object>> migrated = migrateFromGlobalIfNeeded(userId);
            if (migrated.isEmpty()) {
                return null;
            }
            Document document = XmlConfigSupport.newDocument();
            AppConfigSections.writeToDocument(objectMapper, document, migrated.get());
            return XmlConfigSupport.documentToString(document);
        }
        if (!XmlConfigSupport.hasUsableXmlContent(path)) {
            quarantineCorruptConfig(path, userId);
            Optional<Map<String, Object>> migrated = migrateFromGlobalIfNeeded(userId);
            if (migrated.isEmpty()) {
                return null;
            }
            Document document = XmlConfigSupport.newDocument();
            AppConfigSections.writeToDocument(objectMapper, document, migrated.get());
            return XmlConfigSupport.documentToString(document);
        }
        try {
            return XmlConfigSupport.readUtf8(path);
        } catch (Exception ex) {
            quarantineCorruptConfig(path, userId);
            Optional<Map<String, Object>> migrated = migrateFromGlobalIfNeeded(userId);
            if (migrated.isEmpty()) {
                return null;
            }
            Document document = XmlConfigSupport.newDocument();
            AppConfigSections.writeToDocument(objectMapper, document, migrated.get());
            return XmlConfigSupport.documentToString(document);
        }
    }

    public void writeAppConfigXml(long userId, String xml) throws Exception {
        if (xml == null || xml.isBlank()) {
            return;
        }
        var factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        Document document;
        try {
            document = factory.newDocumentBuilder()
                    .parse(new java.io.ByteArrayInputStream(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid XML", ex);
        }
        Map<String, Object> config = AppConfigSections.mapFromDocument(objectMapper, document);
        AppConfigSecrets.decryptAiSection(config, secretValueCodec);
        writeAppConfig(userId, config);
    }

    public Optional<Map<String, Object>> readPersonalSqlSnippets(long userId) {
        Path path = configDirectory.resolve(
                TenantScopedConfigSupport.ensureUserTenantFile(configDirectory, userId, ConfigPaths.SQL_SNIPPETS_PERSONAL));
        if (!XmlConfigSupport.isRegularFile(path)) {
            return appConfigStore.readSqlSnippets("personal");
        }
        Optional<Map<String, Object>> parsed = readSnippetPayload(path);
        if (parsed.isPresent()) {
            return parsed;
        }
        quarantineCorruptConfig(path, userId);
        return appConfigStore.readSqlSnippets("personal");
    }

    public void writePersonalSqlSnippets(long userId, Map<String, Object> payload) throws Exception {
        configDirectory.ensureExists();
        Path path = configDirectory.resolve(
                TenantScopedConfigSupport.ensureUserTenantFile(configDirectory, userId, ConfigPaths.SQL_SNIPPETS_PERSONAL));
        Path parent = path.getParent();
        if (parent != null) {
            java.nio.file.Files.createDirectories(parent);
        }
        Document document = XmlConfigSupport.newDocument();
        var root = document.createElement("datawise-sql-snippets");
        root.setAttribute("layer", "personal");
        document.appendChild(root);
        XmlConfigSupport.appendCdataElement(document, root, "payload", objectMapper.writeValueAsString(payload));
        XmlConfigSupport.writeDocument(path, document);
    }

    private Optional<Map<String, Object>> migrateFromGlobalIfNeeded(long userId) {
        Optional<Map<String, Object>> global = appConfigStore.readAppConfig();
        if (global.isEmpty()) {
            return Optional.empty();
        }
        try {
            writeAppConfig(userId, global.get());
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to migrate global app config for user " + userId, ex);
        }
        return global;
    }

    private Optional<Map<String, Object>> parseAppConfig(Path path) {
        if (!XmlConfigSupport.hasUsableXmlContent(path)) {
            return Optional.empty();
        }
        try {
            Document document = XmlConfigSupport.readDocument(path);
            Map<String, Object> config = AppConfigSections.mapFromDocument(objectMapper, document);
            AppConfigSecrets.decryptAiSection(config, secretValueCodec);
            return Optional.of(config);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.userApp.parse path=" + path, ex);
            return Optional.empty();
        }
    }

    private Optional<Map<String, Object>> readSnippetPayload(Path path) {
        if (!XmlConfigSupport.hasUsableXmlContent(path)) {
            return Optional.empty();
        }
        try {
            Document document = XmlConfigSupport.readDocument(path);
            var root = XmlConfigSupport.rootElement(document);
            String json = XmlConfigSupport.childText(root, "payload");
            if (json == null || json.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(objectMapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<>() {
            }));
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.userSqlSnippets.parse path=" + path, ex);
            return Optional.empty();
        }
    }

    private void quarantineCorruptConfig(Path path, long userId) {
        try {
            Path backup = XmlConfigSupport.quarantineCorruptFile(path);
            if (backup != null) {
                log.warn("Quarantined corrupt user config for user {}: {} -> {}", userId, path, backup);
            }
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.userApp.quarantine userId=" + userId + " path=" + path, ex);
        }
    }

    private Path userConfigPath(long userId) {
        return configDirectory.resolve(ConfigPaths.userAppConfig(userId));
    }
}
