package org.apache.datawise.backend.service.portability;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.apache.datawise.backend.common.support.XmlConfigSupport;
import org.apache.datawise.backend.common.support.AtomicFileWrites;
import org.apache.datawise.backend.configstore.AppConfigStore;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.ProjectStore;
import org.apache.datawise.backend.configstore.UserAiKnowledgeStore;
import org.apache.datawise.backend.configstore.UserAiTableTagStore;
import org.apache.datawise.backend.configstore.UserAnalysisCanvasStore;
import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.apache.datawise.backend.configstore.UserFederatedViewStore;
import org.apache.datawise.backend.configstore.UserSchemaDriftMonitorStore;
import org.apache.datawise.backend.configstore.UserSemanticMetricStore;
import org.apache.datawise.backend.configstore.WorkspaceStore;
import org.apache.datawise.backend.model.AiAnalysisCanvasEntry;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.apache.datawise.backend.model.AiTableTagEntry;
import org.apache.datawise.backend.model.FederatedViewEntry;
import org.apache.datawise.backend.model.SchemaDriftMonitorEntry;
import org.apache.datawise.backend.model.SemanticMetricEntry;
import org.apache.datawise.backend.configstore.app.AppConfigSections;
import org.apache.datawise.backend.domain.ProjectConnectionMembership;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectRequestContext;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.model.ProjectEntity;
import org.apache.datawise.backend.model.ProjectIndexDocument;
import org.apache.datawise.backend.model.SavedConsoleEntity;
import org.apache.datawise.backend.model.SqlHistoryEntity;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.apache.datawise.backend.service.project.ProjectService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Personal profile export/import with passphrase-sealed secrets (machine migration).
 */
@Service
public class ProfilePortabilityService {

    private static final Logger log = LoggerFactory.getLogger(ProfilePortabilityService.class);
    private static final DateTimeFormatter FILE_STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);
    private static final int MAX_PASSPHRASE_FAILURES = 8;
    private static final long PASSPHRASE_LOCK_MS = 15 * 60 * 1000L;

    private static final String[] AI_WORKSPACE_FILES = {
            ConfigPaths.AI_KNOWLEDGE,
            "ai-table-tags.json",
            "analysis-canvas.json",
            "semantic-metrics.json",
            "federated-views.json",
            "schema-drift-monitors.json",
    };

    private final ConnectionStore connectionStore;
    private final UserAppConfigStore userAppConfigStore;
    private final AppConfigStore appConfigStore;
    private final ConfigDirectoryService configDirectory;
    private final SecretValueCodec secretValueCodec;
    private final ObjectMapper objectMapper;
    private final UserAccessPolicy userAccessPolicy;
    private final UserResourcePolicy resourcePolicy;
    private final ProjectStore projectStore;
    private final ProjectService projectService;
    private final WorkspaceStore workspaceStore;
    private final UserAiKnowledgeStore userAiKnowledgeStore;
    private final UserSemanticMetricStore userSemanticMetricStore;
    private final UserAiTableTagStore userAiTableTagStore;
    private final UserAnalysisCanvasStore userAnalysisCanvasStore;
    private final UserFederatedViewStore userFederatedViewStore;
    private final UserSchemaDriftMonitorStore userSchemaDriftMonitorStore;

    private final ConcurrentHashMap<Long, AttemptWindow> passphraseAttempts = new ConcurrentHashMap<>();

    public ProfilePortabilityService(
                                     ConnectionStore connectionStore,
                                     UserAppConfigStore userAppConfigStore,
                                     AppConfigStore appConfigStore,
                                     ConfigDirectoryService configDirectory,
                                     SecretValueCodec secretValueCodec,
                                     ObjectMapper objectMapper,
                                     UserAccessPolicy userAccessPolicy,
                                     UserResourcePolicy resourcePolicy,
                                     @Autowired(required = false) ProjectStore projectStore,
                                     @Autowired(required = false) ProjectService projectService,
                                     WorkspaceStore workspaceStore,
                                     @Autowired(required = false) UserAiKnowledgeStore userAiKnowledgeStore,
                                     @Autowired(required = false) UserSemanticMetricStore userSemanticMetricStore,
                                     @Autowired(required = false) UserAiTableTagStore userAiTableTagStore,
                                     @Autowired(required = false) UserAnalysisCanvasStore userAnalysisCanvasStore,
                                     @Autowired(required = false) UserFederatedViewStore userFederatedViewStore,
                                     @Autowired(required = false) UserSchemaDriftMonitorStore userSchemaDriftMonitorStore) {
        this.connectionStore = connectionStore;
        this.userAppConfigStore = userAppConfigStore;
        this.appConfigStore = appConfigStore;
        this.configDirectory = configDirectory;
        this.secretValueCodec = secretValueCodec;
        this.objectMapper = objectMapper;
        this.userAccessPolicy = userAccessPolicy;
        this.resourcePolicy = resourcePolicy;
        this.projectStore = projectStore;
        this.projectService = projectService;
        this.workspaceStore = workspaceStore;
        this.userAiKnowledgeStore = userAiKnowledgeStore;
        this.userSemanticMetricStore = userSemanticMetricStore;
        this.userAiTableTagStore = userAiTableTagStore;
        this.userAnalysisCanvasStore = userAnalysisCanvasStore;
        this.userFederatedViewStore = userFederatedViewStore;
        this.userSchemaDriftMonitorStore = userSchemaDriftMonitorStore;
    }

    public byte[] exportProfile(ProfileExportRequest request) throws Exception {
        userAccessPolicy.requireRegisteredUser();
        long userId = UserContext.requireUserId();
        String tenantId = UserContext.requireTenantId();
        ProfileDomainOptions domains = request.getDomains();
        if (!domains.isConnections() && !domains.isApp() && !domains.isSnippets()
                && !domains.isAiWorkspace() && !domains.isProjects()
                && !domains.isSavedConsoles() && !domains.isSqlHistory()) {
            throw new IllegalArgumentException("NO_DOMAINS_SELECTED");
        }
        boolean includeSecrets = request.resolvesIncludeSecrets();
        String passphrase = request.getPassphrase();
        String confirm = request.getConfirmPassphrase();
        if (includeSecrets) {
            if (passphrase == null || !passphrase.equals(confirm)) {
                throw new IllegalArgumentException("PASSPHRASE_MISMATCH");
            }
        }

        Map<String, String> sealedSecrets = new LinkedHashMap<>();
        List<String> warnings = new ArrayList<>();
        Map<String, byte[]> entries = new LinkedHashMap<>();
        Map<String, Object> counts = new LinkedHashMap<>();

        if (domains.isConnections()) {
            if (!resourcePolicy.canRead(UserResource.CONNECTION_CATALOG)) {
                throw new IllegalArgumentException(UserAccessPolicy.GUEST_NOT_ALLOWED);
            }
            exportConnections(entries, sealedSecrets, warnings, counts, request);
        }
        if (domains.isApp()) {
            if (!resourcePolicy.canRead(UserResource.APP_CONFIG)) {
                throw new IllegalArgumentException(UserAccessPolicy.GUEST_NOT_ALLOWED);
            }
            exportAppConfig(userId, entries, sealedSecrets, warnings, counts);
        }
        if (domains.isSnippets()) {
            exportSnippets(userId, entries, counts);
        }
        if (domains.isAiWorkspace()) {
            exportAiWorkspace(userId, tenantId, entries, counts);
        }
        if (domains.isProjects()) {
            exportProjects(tenantId, entries, counts, warnings);
        }
        if (domains.isSavedConsoles()) {
            exportSavedConsoles(userId, entries, counts);
        }
        if (domains.isSqlHistory()) {
            exportSqlHistory(userId, entries, counts);
        }

        String secretMode;
        if (includeSecrets) {
            ProfilePassphraseCrypto.SealedSecrets sealed =
                    ProfilePassphraseCrypto.seal(passphrase, objectMapper.writeValueAsString(sealedSecrets));
            entries.put("secrets/sealed.bin", sealed.sealedBin());
            entries.put("secrets/kdf.json", objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsBytes(sealed.kdf()));
            secretMode = ProfileManifest.SECRET_MODE_SEALED;
            counts.put("sealedSecretFields", sealedSecrets.size());
        } else {
            counts.put("omittedSecretFields", sealedSecrets.size());
            if (!sealedSecrets.isEmpty()) {
                warnings.add("CREDENTIALS_OMITTED");
            }
            sealedSecrets.clear();
            secretMode = ProfileManifest.SECRET_MODE_OMITTED;
        }

        ProfileManifest manifest = new ProfileManifest();
        manifest.setKind(ProfileManifest.KIND);
        manifest.setSchemaVersion(ProfileManifest.SCHEMA_VERSION);
        manifest.setAppVersion(resolveAppVersion());
        manifest.setExportedAt(Instant.now().toString());
        manifest.setTenantId(tenantId);
        manifest.setUserId(userId);
        manifest.setSecretMode(secretMode);
        manifest.setDomains(domains.enabledDomainIds());
        manifest.setWarnings(warnings);
        manifest.setCounts(counts);
        entries.put("manifest.json", objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(manifest));

        log.info("profile.exported userId={} tenantId={} domains={} secretMode={}",
                userId, tenantId, domains.enabledDomainIds(), secretMode);
        return ProfilePackageZipCodec.zipEntries(entries);
    }

    public String exportFileName() {
        return exportFileName(null, List.of());
    }

    public String exportFileName(ProfileExportRequest request) {
        if (request == null) {
            return exportFileName(null, List.of());
        }
        return exportFileName(request.getProjectId(), request.getConnectionIds());
    }

    public String exportFileName(String projectId, List<String> connectionIds) {
        String stamp = FILE_STAMP.format(Instant.now());
        if (projectId != null && !projectId.isBlank()
                && (connectionIds == null || connectionIds.isEmpty())) {
            String safe = projectId.replaceAll("[^a-zA-Z0-9._-]+", "_");
            if (safe.length() > 48) {
                safe = safe.substring(0, 48);
            }
            return "datawise-project-connections-" + safe + "-" + stamp + ".dwprofile";
        }
        if (connectionIds != null && connectionIds.size() == 1) {
            String id = connectionIds.get(0);
            String safe = id == null ? "connection" : id.replaceAll("[^a-zA-Z0-9._-]+", "_");
            if (safe.length() > 48) {
                safe = safe.substring(0, 48);
            }
            return "datawise-connection-" + safe + "-" + stamp + ".dwprofile";
        }
        return "datawise-profile-" + stamp + ".dwprofile";
    }

    public ProfilePreflightResult preflight(byte[] packageBytes, String passphrase) throws Exception {
        userAccessPolicy.requireRegisteredUser();
        assertPassphraseNotLocked(UserContext.requireUserId());

        ProfilePreflightResult result = new ProfilePreflightResult();
        ParsedPackage parsed = parsePackage(packageBytes);
        result.setLegacyKind(parsed.legacyKind());
        result.setManifest(parsed.manifest());
        result.setWarnings(new ArrayList<>(parsed.warnings()));

        if (parsed.legacyKind() != null) {
            result.setSchemaCompatible(true);
            result.setPassphraseOk(true);
            result.setCounts(parsed.counts());
            result.setConflicts(detectConflicts(parsed, ProfileDomainOptions.defaults()));
            return result;
        }

        boolean compatible = parsed.manifest() != null
                && ProfileManifest.KIND.equals(parsed.manifest().getKind())
                && parsed.manifest().getSchemaVersion() <= ProfileManifest.SCHEMA_VERSION;
        result.setSchemaCompatible(compatible);
        if (!compatible) {
            result.setPassphraseOk(false);
            result.getWarnings().add("SCHEMA_UNSUPPORTED");
            return result;
        }

        if (isOmittedSecretMode(parsed.manifest())) {
            result.setPassphraseOk(true);
            result.setCounts(buildImportCounts(parsed, Map.of()));
            result.setConflicts(detectConflicts(parsed, ProfileDomainOptions.defaults()));
            if (parsed.manifest().getWarnings() != null) {
                result.getWarnings().addAll(parsed.manifest().getWarnings());
            }
            result.getWarnings().add("CREDENTIALS_OMITTED_PACKAGE");
            return result;
        }

        try {
            Map<String, String> secrets = unsealSecrets(parsed, passphrase);
            result.setPassphraseOk(true);
            clearPassphraseFailures(UserContext.requireUserId());
            result.setCounts(buildImportCounts(parsed, secrets));
            result.setConflicts(detectConflicts(parsed, ProfileDomainOptions.defaults()));
            if (parsed.manifest().getWarnings() != null) {
                result.getWarnings().addAll(parsed.manifest().getWarnings());
            }
        } catch (IllegalArgumentException ex) {
            recordPassphraseFailure(UserContext.requireUserId());
            result.setPassphraseOk(false);
            result.getWarnings().add(ex.getMessage() != null ? ex.getMessage() : "PASSPHRASE_INCORRECT");
        }
        return result;
    }

    public ProfileImportResult importProfile(
                                             byte[] packageBytes,
                                             String passphrase,
                                             ProfileImportOptions options) throws Exception {
        userAccessPolicy.requireRegisteredUser();
        long userId = UserContext.requireUserId();
        assertPassphraseNotLocked(userId);
        ProfileDomainOptions domains = options != null ? options.getDomains() : ProfileDomainOptions.defaults();

        ParsedPackage parsed = parsePackage(packageBytes);
        ProfileImportResult result = new ProfileImportResult();
        List<String> warnings = new ArrayList<>(parsed.warnings());

        if (parsed.legacyKind() != null) {
            return importLegacy(parsed, domains, userId, result, warnings);
        }

        if (parsed.manifest() == null
                || !ProfileManifest.KIND.equals(parsed.manifest().getKind())
                || parsed.manifest().getSchemaVersion() > ProfileManifest.SCHEMA_VERSION) {
            throw new IllegalArgumentException("SCHEMA_UNSUPPORTED");
        }

        boolean omittedSecrets = isOmittedSecretMode(parsed.manifest());
        Map<String, String> secrets;
        if (omittedSecrets) {
            secrets = Map.of();
            warnings.add("CREDENTIALS_OMITTED_PACKAGE");
        } else {
            try {
                secrets = unsealSecrets(parsed, passphrase);
                clearPassphraseFailures(userId);
            } catch (IllegalArgumentException ex) {
                recordPassphraseFailure(userId);
                throw ex;
            }
        }

        Map<String, Object> counts = new LinkedHashMap<>();
        List<String> applied = new ArrayList<>();
        boolean restart = false;

        if (domains.isConnections() && parsed.files().containsKey("payload/connections.xml")) {
            resourcePolicy.requireWrite(UserResource.CONNECTIONS_XML_BULK);
            int merged = importConnections(
                    parsed.files().get("payload/connections.xml"),
                    secrets,
                    warnings,
                    omittedSecrets);
            counts.put("connections", merged);
            applied.add(ProfileDomainOptions.CONNECTIONS);
        }
        if (domains.isApp() && parsed.files().containsKey("payload/app.xml")) {
            resourcePolicy.requireWrite(UserResource.APP_CONFIG);
            boolean needsRestart = importAppConfig(
                    userId,
                    parsed.files().get("payload/app.xml"),
                    secrets,
                    domains.appSectionFilter(),
                    warnings);
            restart = restart || needsRestart;
            counts.put("app", 1);
            applied.add(ProfileDomainOptions.APP);
        }
        if (domains.isSnippets()) {
            int snippetCount = importSnippets(userId, parsed.files(), warnings);
            if (snippetCount > 0) {
                counts.put("snippets", snippetCount);
                applied.add(ProfileDomainOptions.SNIPPETS);
            }
        }
        if (domains.isAiWorkspace()) {
            int aiCount = importAiWorkspace(userId, UserContext.requireTenantId(), parsed.files());
            if (aiCount > 0) {
                counts.put("aiWorkspaceFiles", aiCount);
                applied.add(ProfileDomainOptions.AI_WORKSPACE);
            }
        }
        if (domains.isProjects()) {
            int projectCount = importProjects(
                    UserContext.requireTenantId(),
                    parsed.files(),
                    domains.getProjectFileConflict(),
                    warnings);
            if (projectCount > 0) {
                counts.put("projects", projectCount);
                applied.add(ProfileDomainOptions.PROJECTS);
            }
        }
        if (domains.isSavedConsoles()) {
            int consoleCount = importSavedConsoles(userId, parsed.files());
            if (consoleCount > 0) {
                counts.put("savedConsoles", consoleCount);
                applied.add(ProfileDomainOptions.SAVED_CONSOLES);
            }
        }
        if (domains.isSqlHistory()) {
            int historyCount = importSqlHistory(userId, parsed.files());
            if (historyCount > 0) {
                counts.put("sqlHistory", historyCount);
                applied.add(ProfileDomainOptions.SQL_HISTORY);
            }
        }

        if (parsed.manifest().getWarnings() != null) {
            warnings.addAll(parsed.manifest().getWarnings());
        }

        result.setSuccess(true);
        result.setAppliedDomains(applied);
        result.setWarnings(warnings);
        result.setCounts(counts);
        result.setRestartRecommended(restart);
        log.info("profile.imported userId={} domains={} counts={}", userId, applied, counts);
        return result;
    }

    private ProfileImportResult importLegacy(
                                             ParsedPackage parsed,
                                             ProfileDomainOptions domains,
                                             long userId,
                                             ProfileImportResult result,
                                             List<String> warnings) throws Exception {
        Map<String, Object> counts = new LinkedHashMap<>();
        List<String> applied = new ArrayList<>();
        if ("datawise-config-snapshot".equals(parsed.legacyKind()) && domains.isConnections()) {
            resourcePolicy.requireWrite(UserResource.CONNECTION_CATALOG);
            byte[] json = parsed.files().get("legacy/snapshot.json");
            Map<String, Object> snapshot = objectMapper.readValue(json, new TypeReference<>() {
            });
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> connections = snapshot.get("connections") instanceof List<?> list
                    ? (List<Map<String, Object>>) list
                    : List.of();
            int imported = importSnapshotConnections(connections, warnings);
            counts.put("connections", imported);
            applied.add(ProfileDomainOptions.CONNECTIONS);
            warnings.add("LEGACY_SNAPSHOT_IMPORTED");
        } else if ("datawise-app-xml".equals(parsed.legacyKind()) && domains.isApp()) {
            resourcePolicy.requireWrite(UserResource.APP_CONFIG);
            byte[] xml = parsed.files().get("legacy/app.xml");
            importAppConfig(userId, xml, Map.of(), domains.appSectionFilter(), warnings);
            counts.put("app", 1);
            applied.add(ProfileDomainOptions.APP);
            warnings.add("LEGACY_APP_XML_IMPORTED");
        } else {
            throw new IllegalArgumentException("LEGACY_UNSUPPORTED");
        }
        result.setSuccess(true);
        result.setAppliedDomains(applied);
        result.setWarnings(warnings);
        result.setCounts(counts);
        return result;
    }

    private void exportConnections(
                                   Map<String, byte[]> entries,
                                   Map<String, String> sealedSecrets,
                                   List<String> warnings,
                                   Map<String, Object> counts,
                                   ProfileExportRequest request) throws Exception {
        long currentUserId = UserContext.requireUserId();
        List<ConnectionEntity> allConnections = connectionStore.findAllConnections();
        List<ConnectionGroupEntity> allGroups = connectionStore.findAllGroups();
        if (allConnections == null || allConnections.isEmpty()) {
            counts.put("connections", 0);
            counts.put("connectionGroups", 0);
            return;
        }
        Set<String> idFilter = null;
        List<String> connectionIds = request != null ? request.getConnectionIds() : List.of();
        if (connectionIds != null && !connectionIds.isEmpty()) {
            idFilter = new LinkedHashSet<>();
            for (String id : connectionIds) {
                if (id != null && !id.isBlank()) {
                    idFilter.add(id.trim());
                }
            }
            if (idFilter.isEmpty()) {
                idFilter = null;
            }
        }
        String projectFilter = null;
        if (idFilter == null && request != null && request.getProjectId() != null && !request.getProjectId().isBlank()) {
            projectFilter = request.getProjectId().trim();
        }
        List<ConnectionEntity> redacted = new ArrayList<>();
        for (ConnectionEntity connection : allConnections) {
            // Personal migration: never export another account's connections.
            if (connection.getUserId() != null && !ownedByUser(connection.getUserId(), currentUserId)) {
                continue;
            }
            if (idFilter != null && !idFilter.contains(connection.getId())) {
                continue;
            }
            if (projectFilter != null
                    && !ProjectConnectionMembership.belongsToProject(connection, projectFilter)) {
                continue;
            }
            ConnectionEntity copy = copyConnection(connection);
            extractConnectionSecrets(copy, sealedSecrets, warnings);
            redacted.add(copy);
        }
        if (idFilter != null && redacted.isEmpty()) {
            throw new IllegalArgumentException("CONNECTION_NOT_FOUND");
        }
        List<ConnectionGroupEntity> groups = selectAncestorGroups(
                allGroups != null ? allGroups : List.of(),
                redacted);
        String out = ConnectionsXmlCodec.writeToString(groups, redacted, objectMapper);
        entries.put("payload/connections.xml", out.getBytes(StandardCharsets.UTF_8));
        counts.put("connections", redacted.size());
        counts.put("connectionGroups", groups.size());
        if (projectFilter != null) {
            counts.put("projectId", ProjectIds.normalizeOrDefault(projectFilter));
        }
    }

    /** Keep only groups that contain (or are ancestors of) the exported connections. */
    private static List<ConnectionGroupEntity> selectAncestorGroups(
                                                                    List<ConnectionGroupEntity> allGroups,
                                                                    List<ConnectionEntity> connections) {
        if (allGroups == null || allGroups.isEmpty() || connections == null || connections.isEmpty()) {
            return List.of();
        }
        Map<String, ConnectionGroupEntity> byId = new LinkedHashMap<>();
        for (ConnectionGroupEntity group : allGroups) {
            if (group != null && group.getId() != null) {
                byId.put(group.getId(), group);
            }
        }
        Set<String> keep = new LinkedHashSet<>();
        for (ConnectionEntity connection : connections) {
            String groupId = connection.getGroupId();
            while (groupId != null && !groupId.isBlank() && keep.add(groupId)) {
                ConnectionGroupEntity group = byId.get(groupId);
                if (group == null) {
                    break;
                }
                groupId = group.getParentId();
            }
        }
        List<ConnectionGroupEntity> selected = new ArrayList<>();
        for (ConnectionGroupEntity group : allGroups) {
            if (group != null && keep.contains(group.getId())) {
                selected.add(group);
            }
        }
        return selected;
    }

    private void exportAppConfig(
                                 long userId,
                                 Map<String, byte[]> entries,
                                 Map<String, String> sealedSecrets,
                                 List<String> warnings,
                                 Map<String, Object> counts) throws Exception {
        String xml = userAppConfigStore.readAppConfigXml(userId);
        if (xml == null || xml.isBlank()) {
            counts.put("app", 0);
            return;
        }
        Document document = XmlConfigSupport.readDocumentFromString(xml);
        Map<String, Object> config = AppConfigSections.mapFromDocument(objectMapper, document);
        // Device-local WebDAV / sync transport secrets must never leave this machine via profile packages.
        if (config.remove(ConfigCloudSyncService.APP_SECTION) != null) {
            warnings.add("CLOUD_SYNC_SETTINGS_EXCLUDED");
        }
        extractAiSecrets(config, sealedSecrets, warnings);
        Document outDoc = XmlConfigSupport.newDocument();
        AppConfigSections.writeToDocument(objectMapper, outDoc, config);
        entries.put("payload/app.xml", XmlConfigSupport.documentToString(outDoc).getBytes(StandardCharsets.UTF_8));
        counts.put("app", 1);
        counts.put("aiSecretFields", countAiSecretKeys(sealedSecrets));
    }

    private void exportSnippets(long userId, Map<String, byte[]> entries, Map<String, Object> counts) throws Exception {
        int count = 0;
        var shared = appConfigStore.readSqlSnippets("shared");
        if (shared.isPresent()) {
            entries.put(
                    "payload/sql-snippets.shared.json",
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(shared.get()));
            count++;
        }
        var personal = userAppConfigStore.readPersonalSqlSnippets(userId);
        if (personal.isPresent()) {
            entries.put(
                    "payload/sql-snippets.personal.json",
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(personal.get()));
            count++;
        }
        counts.put("snippets", count);
    }

    private void exportAiWorkspace(
                                   long userId,
                                   String tenantId,
                                   Map<String, byte[]> entries,
                                   Map<String, Object> counts) throws IOException {
        int count = 0;
        for (String fileName : AI_WORKSPACE_FILES) {
            Path path = configDirectory.resolve(ConfigPaths.userTenantFile(userId, tenantId, fileName));
            if (Files.isRegularFile(path)) {
                entries.put("payload/ai/" + fileName, Files.readAllBytes(path));
                count++;
            }
        }
        counts.put("aiWorkspaceFiles", count);
    }

    private void exportProjects(
                                String tenantId,
                                Map<String, byte[]> entries,
                                Map<String, Object> counts,
                                List<String> warnings) throws IOException {
        ProjectStore store = projectStore;
        if (store == null) {
            warnings.add("PROJECT_STORE_UNAVAILABLE");
            counts.put("projects", 0);
            return;
        }
        List<ProjectEntity> projects = store.listProjects(tenantId);
        ProjectIndexDocument index = store.loadIndex(tenantId);
        entries.put(
                "payload/projects/index.json",
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(index));
        int fileCount = 0;
        for (ProjectEntity project : projects) {
            Path root = configDirectory.resolve(ConfigPaths.tenantProjectDir(tenantId, project.getId()));
            if (!Files.isDirectory(root)) {
                continue;
            }
            String prefix = "payload/projects/" + project.getId() + "/";
            try (var walk = Files.walk(root)) {
                for (Path path : walk.filter(Files::isRegularFile).toList()) {
                    String relative = root.relativize(path).toString().replace('\\', '/');
                    if ("connections.xml".equals(relative)) {
                        // Connection secrets live in the tenant catalog / sealed bag; skip duplicate.
                        continue;
                    }
                    entries.put(prefix + relative, Files.readAllBytes(path));
                    fileCount++;
                }
            }
        }
        counts.put("projects", projects.size());
        counts.put("projectFiles", fileCount);
    }

    private void exportSavedConsoles(long userId, Map<String, byte[]> entries, Map<String, Object> counts) throws Exception {
        List<SavedConsoleEntity> consoles = workspaceStore.findSavedConsolesByUserId(userId);
        entries.put(
                "payload/saved-consoles.json",
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(consoles));
        counts.put("savedConsoles", consoles.size());
    }

    private void exportSqlHistory(long userId, Map<String, byte[]> entries, Map<String, Object> counts) throws Exception {
        List<SqlHistoryEntity> history = workspaceStore.findSqlHistoryByUserId(userId);
        entries.put(
                "payload/sql-history.json",
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(history));
        counts.put("sqlHistory", history.size());
    }

    private int importConnections(
                                  byte[] xmlBytes,
                                  Map<String, String> secrets,
                                  List<String> warnings,
                                  boolean preserveLocalSecrets) throws Exception {
        ConnectionsXmlCodec.ParsedCatalog incoming = ConnectionsXmlCodec.readXml(
                new String(xmlBytes, StandardCharsets.UTF_8),
                objectMapper);
        applyConnectionSecrets(incoming.connections(), secrets);

        long currentUserId = UserContext.requireUserId();
        String tenantId = UserContext.requireTenantId();
        String targetProjectId = resolveTargetProjectId();

        Map<String, ConnectionGroupEntity> groupsById = new LinkedHashMap<>();
        for (ConnectionGroupEntity group : connectionStore.findAllGroups()) {
            groupsById.put(group.getId(), group);
        }
        Map<String, ConnectionEntity> connectionsById = new LinkedHashMap<>();
        Map<String, String> nameToId = new HashMap<>();
        for (ConnectionEntity connection : connectionStore.findAllConnections()) {
            connectionsById.put(connection.getId(), connection);
            if (connection.getName() != null && ownedByUser(connection.getUserId(), currentUserId)) {
                nameToId.put(connection.getName().toLowerCase(Locale.ROOT), connection.getId());
            }
        }
        if (preserveLocalSecrets) {
            for (ConnectionEntity incomingConnection : incoming.connections()) {
                if (incomingConnection == null || incomingConnection.getId() == null) {
                    continue;
                }
                preserveBlankSecretsFromLocal(
                        incomingConnection,
                        connectionsById.get(incomingConnection.getId()));
            }
        }

        Map<String, String> groupIdRemap = new LinkedHashMap<>();
        for (ConnectionGroupEntity group : incoming.groups()) {
            String oldId = group.getId();
            if (oldId == null || oldId.isBlank()) {
                continue;
            }
            ConnectionGroupEntity existing = groupsById.get(oldId);
            if (existing != null && !ownedByUser(existing.getUserId(), currentUserId)) {
                String newId = "g-" + UUID.randomUUID();
                groupIdRemap.put(oldId, newId);
                warnings.add("GROUP_ID_REASSIGNED:" + oldId);
            } else {
                groupIdRemap.put(oldId, oldId);
            }
        }

        for (ConnectionGroupEntity group : incoming.groups()) {
            String oldId = group.getId();
            if (oldId == null || oldId.isBlank()) {
                continue;
            }
            String newId = groupIdRemap.getOrDefault(oldId, oldId);
            group.setId(newId);
            String parentId = group.getParentId();
            if (parentId != null && !parentId.isBlank()) {
                if (groupIdRemap.containsKey(parentId)) {
                    group.setParentId(groupIdRemap.get(parentId));
                } else {
                    ConnectionGroupEntity parent = groupsById.get(parentId);
                    if (parent == null || !ownedByUser(parent.getUserId(), currentUserId)) {
                        group.setParentId(null);
                    }
                }
            }
            group.setUserId(currentUserId);
            group.setTenantId(tenantId);
            group.setProjectId(targetProjectId);
            groupsById.put(newId, group);
        }

        String fallbackGroupId = ensureImporterGroup(groupsById, currentUserId, tenantId, targetProjectId);

        int imported = 0;
        for (ConnectionEntity connection : incoming.connections()) {
            String oldId = connection.getId();
            if (oldId == null || oldId.isBlank()) {
                continue;
            }
            ConnectionEntity existing = connectionsById.get(oldId);
            String id = oldId;
            if (existing != null && !ownedByUser(existing.getUserId(), currentUserId)) {
                id = "c-" + UUID.randomUUID();
                connection.setId(id);
                warnings.add("CONNECTION_ID_REASSIGNED:" + oldId);
            }

            String name = connection.getName();
            if (name != null) {
                String existingNameId = nameToId.get(name.toLowerCase(Locale.ROOT));
                if (existingNameId != null && !existingNameId.equals(id)) {
                    connection.setName(name + " (imported)");
                    warnings.add("CONNECTION_RENAMED:" + id);
                }
            }

            String groupId = connection.getGroupId();
            String resolvedGroupId = fallbackGroupId;
            if (groupId != null && !groupId.isBlank()) {
                if (groupIdRemap.containsKey(groupId)) {
                    resolvedGroupId = groupIdRemap.get(groupId);
                } else {
                    ConnectionGroupEntity host = groupsById.get(groupId);
                    if (host != null && ownedByUser(host.getUserId(), currentUserId)) {
                        resolvedGroupId = groupId;
                    } else {
                        warnings.add("CONNECTION_GROUP_REASSIGNED:" + oldId);
                    }
                }
            }
            connection.setGroupId(resolvedGroupId);
            connection.setUserId(currentUserId);
            connection.setTenantId(tenantId);
            connection.setProjectId(targetProjectId);
            connectionsById.put(id, connection);
            if (connection.getName() != null) {
                nameToId.put(connection.getName().toLowerCase(Locale.ROOT), id);
            }
            imported++;
        }

        connectionStore.replaceAll(new ArrayList<>(groupsById.values()), new ArrayList<>(connectionsById.values()));
        return imported;
    }

    private String resolveTargetProjectId() {
        String fromHeader = ProjectRequestContext.projectIdOverride();
        if (fromHeader != null && !fromHeader.isBlank()) {
            return ProjectIds.normalizeOrDefault(fromHeader);
        }
        if (projectService != null) {
            try {
                return ProjectIds.normalizeOrDefault(projectService.resolveActiveProjectId());
            } catch (Exception ex) {
                if (ex instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                // Fall through to default when project service is unavailable in tests.
            }
        }
        return ProjectIds.DEFAULT;
    }

    private String ensureImporterGroup(
                                       Map<String, ConnectionGroupEntity> groupsById,
                                       long userId,
                                       String tenantId,
                                       String projectId) {
        for (ConnectionGroupEntity group : groupsById.values()) {
            if (ownedByUser(group.getUserId(), userId)
                    && ProjectIds.normalizeOrDefault(group.getProjectId()).equals(projectId)
                    && (group.getParentId() == null || group.getParentId().isBlank())) {
                return group.getId();
            }
        }
        ConnectionGroupEntity created = new ConnectionGroupEntity();
        created.setId("g-" + UUID.randomUUID());
        created.setLabel("Imported");
        created.setUserId(userId);
        created.setTenantId(tenantId);
        created.setProjectId(projectId);
        created.setSortOrder(0);
        created.setExpanded(true);
        groupsById.put(created.getId(), created);
        return created.getId();
    }

    private static boolean ownedByUser(Long ownerId, long userId) {
        return ownerId != null && ownerId == userId;
    }

    private int importSnapshotConnections(List<Map<String, Object>> connections, List<String> warnings) throws Exception {
        if (connections == null || connections.isEmpty()) {
            return 0;
        }
        long currentUserId = UserContext.requireUserId();
        String tenantId = UserContext.requireTenantId();
        String targetProjectId = resolveTargetProjectId();

        Map<String, ConnectionEntity> byId = new LinkedHashMap<>();
        for (ConnectionEntity existing : connectionStore.findAllConnections()) {
            byId.put(existing.getId(), existing);
        }
        Map<String, ConnectionGroupEntity> groups = new LinkedHashMap<>();
        for (ConnectionGroupEntity group : connectionStore.findAllGroups()) {
            groups.put(group.getId(), group);
        }
        String defaultGroupId = ensureImporterGroup(groups, currentUserId, tenantId, targetProjectId);
        int count = 0;
        for (Map<String, Object> raw : connections) {
            ConnectionEntity entity = objectMapper.convertValue(raw, ConnectionEntity.class);
            if (entity.getId() == null || entity.getId().isBlank()) {
                continue;
            }
            ConnectionEntity existing = byId.get(entity.getId());
            if (existing != null && !ownedByUser(existing.getUserId(), currentUserId)) {
                entity.setId("c-" + UUID.randomUUID());
            }
            if (entity.getGroupId() == null || entity.getGroupId().isBlank()
                    || !groups.containsKey(entity.getGroupId())
                    || !ownedByUser(groups.get(entity.getGroupId()).getUserId(), currentUserId)) {
                entity.setGroupId(defaultGroupId);
            }
            entity.setUserId(currentUserId);
            entity.setTenantId(tenantId);
            entity.setProjectId(targetProjectId);
            byId.put(entity.getId(), entity);
            count++;
        }
        connectionStore.replaceAll(new ArrayList<>(groups.values()), new ArrayList<>(byId.values()));
        warnings.add("LEGACY_SNAPSHOT_SECRETS_MAY_BE_MISSING");
        return count;
    }

    private boolean importAppConfig(
                                    long userId,
                                    byte[] xmlBytes,
                                    Map<String, String> secrets,
                                    Set<String> sectionFilter,
                                    List<String> warnings) throws Exception {
        Document document = XmlConfigSupport.readDocumentFromString(new String(xmlBytes, StandardCharsets.UTF_8));
        Map<String, Object> incoming = AppConfigSections.mapFromDocument(objectMapper, document);
        applyAiSecrets(incoming, secrets);

        Map<String, Object> current = userAppConfigStore.readAppConfig(userId).orElseGet(LinkedHashMap::new);
        Map<String, Object> merged = AppConfigSections.deepCopy(current);
        boolean restart = false;
        for (String section : AppConfigSections.JSON_SECTIONS) {
            if (!sectionFilter.isEmpty() && !sectionFilter.contains(section)) {
                continue;
            }
            if (!incoming.containsKey(section)) {
                continue;
            }
            merged.put(section, incoming.get(section));
            if ("window".equals(section) || "localFiles".equals(section)) {
                restart = true;
            }
        }
        if (incoming.containsKey("locale") && (sectionFilter.isEmpty() || sectionFilter.contains("locale"))) {
            merged.put("locale", incoming.get("locale"));
        }
        for (String key : incoming.keySet()) {
            if ("version".equals(key) || "exportedAt".equals(key) || "locale".equals(key)) {
                continue;
            }
            boolean known = false;
            for (String section : AppConfigSections.JSON_SECTIONS) {
                if (section.equals(key)) {
                    known = true;
                    break;
                }
            }
            if (!known) {
                warnings.add("UNKNOWN_APP_SECTION:" + key);
            }
        }
        userAppConfigStore.writeAppConfig(userId, merged);
        return restart;
    }

    private int importSnippets(long userId, Map<String, byte[]> files, List<String> warnings) throws Exception {
        int count = 0;
        Map<String, Object> personalBase = userAppConfigStore.readPersonalSqlSnippets(userId).orElseGet(LinkedHashMap::new);

        // Shared snippets are tenant-wide. Never write them on import — fold into the importer's
        // personal snippets so cross-account import cannot change other users' shared catalog.
        byte[] shared = files.get("payload/sql-snippets.shared.json");
        if (shared != null) {
            Map<String, Object> payload = objectMapper.readValue(shared, new TypeReference<>() {
            });
            personalBase = mergeSnippetMaps(personalBase, payload);
            warnings.add("SHARED_SNIPPETS_MERGED_INTO_PERSONAL");
            count++;
        }
        byte[] personal = files.get("payload/sql-snippets.personal.json");
        if (personal != null) {
            resourcePolicy.requireWrite(UserResource.SQL_SNIPPETS_PERSONAL);
            Map<String, Object> payload = objectMapper.readValue(personal, new TypeReference<>() {
            });
            personalBase = mergeSnippetMaps(personalBase, payload);
            count++;
        }
        if (count > 0) {
            resourcePolicy.requireWrite(UserResource.SQL_SNIPPETS_PERSONAL);
            userAppConfigStore.writePersonalSqlSnippets(userId, personalBase);
        }
        return count;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mergeSnippetMaps(Map<String, Object> local, Map<String, Object> incoming) {
        Map<String, Object> merged = AppConfigSections.deepCopy(local);
        for (Map.Entry<String, Object> entry : incoming.entrySet()) {
            Object localVal = merged.get(entry.getKey());
            Object inVal = entry.getValue();
            if (localVal instanceof Map<?, ?> localMap && inVal instanceof Map<?, ?> inMap) {
                Map<String, Object> child = new LinkedHashMap<>((Map<String, Object>) localMap);
                child.putAll((Map<String, Object>) inMap);
                merged.put(entry.getKey(), child);
            } else if (localVal instanceof List<?> localList && inVal instanceof List<?> inList) {
                List<Object> child = new ArrayList<>(localList);
                Set<String> ids = new HashSet<>();
                for (Object item : localList) {
                    if (item instanceof Map<?, ?> map && map.get("id") != null) {
                        ids.add(String.valueOf(map.get("id")));
                    }
                }
                for (Object item : inList) {
                    if (item instanceof Map<?, ?> map && map.get("id") != null) {
                        String id = String.valueOf(map.get("id"));
                        if (ids.contains(id)) {
                            child.removeIf(existing -> existing instanceof Map<?, ?> em && id.equals(String.valueOf(em.get("id"))));
                        }
                    }
                    child.add(item);
                }
                merged.put(entry.getKey(), child);
            } else {
                merged.put(entry.getKey(), inVal);
            }
        }
        return merged;
    }

    private int importAiWorkspace(long userId, String tenantId, Map<String, byte[]> files) throws IOException {
        int count = 0;
        for (String fileName : AI_WORKSPACE_FILES) {
            byte[] bytes = files.get("payload/ai/" + fileName);
            if (bytes == null) {
                continue;
            }
            if (ConfigPaths.AI_KNOWLEDGE.equals(fileName) && userAiKnowledgeStore != null) {
                List<AiKnowledgeEntry> entries = objectMapper.readValue(bytes, new TypeReference<>() {
                });
                userAiKnowledgeStore.replaceAll(userId, entries);
                count++;
                continue;
            }
            if ("semantic-metrics.json".equals(fileName) && userSemanticMetricStore != null) {
                List<SemanticMetricEntry> entries = objectMapper.readValue(bytes, new TypeReference<>() {
                });
                userSemanticMetricStore.replaceAll(userId, entries);
                count++;
                continue;
            }
            if ("ai-table-tags.json".equals(fileName) && userAiTableTagStore != null) {
                List<AiTableTagEntry> entries = objectMapper.readValue(bytes, new TypeReference<>() {
                });
                userAiTableTagStore.replaceAll(userId, entries);
                count++;
                continue;
            }
            if ("analysis-canvas.json".equals(fileName) && userAnalysisCanvasStore != null) {
                List<AiAnalysisCanvasEntry> entries = objectMapper.readValue(bytes, new TypeReference<>() {
                });
                userAnalysisCanvasStore.replaceAll(userId, entries);
                count++;
                continue;
            }
            if ("federated-views.json".equals(fileName) && userFederatedViewStore != null) {
                List<FederatedViewEntry> entries = objectMapper.readValue(bytes, new TypeReference<>() {
                });
                userFederatedViewStore.replaceAll(userId, entries);
                count++;
                continue;
            }
            if ("schema-drift-monitors.json".equals(fileName) && userSchemaDriftMonitorStore != null) {
                List<SchemaDriftMonitorEntry> entries = objectMapper.readValue(bytes, new TypeReference<>() {
                });
                userSchemaDriftMonitorStore.replaceAll(userId, entries);
                count++;
                continue;
            }
            // Fallback only when the matching Store bean is unavailable.
            Path path = configDirectory.resolve(ConfigPaths.userTenantFile(userId, tenantId, fileName));
            AtomicFileWrites.writeBytes(path, bytes);
            count++;
        }
        return count;
    }

    private int importProjects(
                               String tenantId,
                               Map<String, byte[]> files,
                               String conflictMode,
                               List<String> warnings) throws Exception {
        ProjectStore store = projectStore;
        if (store == null) {
            warnings.add("PROJECT_STORE_UNAVAILABLE");
            return 0;
        }
        byte[] indexBytes = files.get("payload/projects/index.json");
        if (indexBytes == null) {
            return 0;
        }
        ProjectIndexDocument incoming = objectMapper.readValue(indexBytes, ProjectIndexDocument.class);
        ProjectIndexDocument local = store.loadIndex(tenantId);
        Map<String, ProjectEntity> byId = new LinkedHashMap<>();
        Set<String> existingProjectIds = new HashSet<>();
        if (local.getProjects() != null) {
            for (ProjectEntity project : local.getProjects()) {
                byId.put(project.getId(), project);
                existingProjectIds.add(project.getId());
            }
        }
        int added = 0;
        if (incoming.getProjects() != null) {
            for (ProjectEntity project : incoming.getProjects()) {
                if (project.getId() == null || project.getId().isBlank()) {
                    continue;
                }
                // Never replace another account's existing tenant project definition.
                if (byId.containsKey(project.getId())) {
                    continue;
                }
                byId.put(project.getId(), project);
                added++;
            }
        }
        ProjectIndexDocument merged = new ProjectIndexDocument();
        merged.setVersion(local.getVersion() > 0 ? local.getVersion() : incoming.getVersion());
        // Keep local default project — switching it would affect every account on this tenant.
        merged.setDefaultProjectId(
                local.getDefaultProjectId() != null ? local.getDefaultProjectId() : incoming.getDefaultProjectId());
        merged.setProjects(new ArrayList<>(byId.values()));
        if (added > 0) {
            store.saveIndex(tenantId, merged);
        }

        boolean preferImported = !"keepLocal".equalsIgnoreCase(conflictMode);
        int projectCount = 0;
        Set<String> writtenProjects = new HashSet<>();
        for (String key : files.keySet()) {
            if (!key.startsWith("payload/projects/") || key.equals("payload/projects/index.json")) {
                continue;
            }
            String rest = key.substring("payload/projects/".length());
            int slash = rest.indexOf('/');
            if (slash <= 0) {
                continue;
            }
            String projectId = rest.substring(0, slash);
            String relative = rest.substring(slash + 1);
            // Only materialize files for newly added projects; never rewrite existing shared project trees.
            if (existingProjectIds.contains(projectId)) {
                warnings.add("PROJECT_FILES_SKIPPED_EXISTING:" + projectId);
                continue;
            }
            Path target = configDirectory.resolve(ConfigPaths.tenantProjectDir(tenantId, projectId)).resolve(relative);
            if (Files.exists(target) && !preferImported) {
                continue;
            }
            AtomicFileWrites.writeBytes(target, files.get(key));
            writtenProjects.add(projectId);
        }
        projectCount = Math.max(added, writtenProjects.size());
        if (projectCount == 0 && !existingProjectIds.isEmpty() && incoming.getProjects() != null) {
            warnings.add("PROJECTS_SKIPPED_ALL_EXISTING");
        }
        return projectCount;
    }

    private int importSavedConsoles(long userId, Map<String, byte[]> files) throws Exception {
        byte[] bytes = files.get("payload/saved-consoles.json");
        if (bytes == null) {
            return 0;
        }
        List<SavedConsoleEntity> incoming = objectMapper.readValue(bytes, new TypeReference<>() {
        });
        String tenantId = UserContext.requireTenantId();
        Map<String, SavedConsoleEntity> existingById = new LinkedHashMap<>();
        for (SavedConsoleEntity existing : workspaceStore.findSavedConsolesByIds(
                incoming.stream().map(SavedConsoleEntity::getId).filter(id -> id != null && !id.isBlank()).toList())) {
            existingById.put(existing.getId(), existing);
        }
        int count = 0;
        for (SavedConsoleEntity entity : incoming) {
            if (entity.getId() == null || entity.getId().isBlank()) {
                continue;
            }
            SavedConsoleEntity existing = existingById.get(entity.getId());
            if (existing != null && !ownedByUser(existing.getUserId(), userId)) {
                entity.setId("sc-" + UUID.randomUUID());
            }
            entity.setUserId(userId);
            entity.setTenantId(tenantId);
            workspaceStore.saveSavedConsole(entity);
            count++;
        }
        return count;
    }

    private int importSqlHistory(long userId, Map<String, byte[]> files) throws Exception {
        byte[] bytes = files.get("payload/sql-history.json");
        if (bytes == null) {
            return 0;
        }
        List<SqlHistoryEntity> incoming = objectMapper.readValue(bytes, new TypeReference<>() {
        });
        String tenantId = UserContext.requireTenantId();
        Set<String> ownIds = workspaceStore.findSqlHistoryByUserId(userId).stream()
                .map(SqlHistoryEntity::getId)
                .collect(java.util.stream.Collectors.toSet());
        int count = 0;
        // Import oldest first so trim keeps the newest after append+trim.
        List<SqlHistoryEntity> ordered = new ArrayList<>(incoming);
        ordered.sort(java.util.Comparator.comparing(
                SqlHistoryEntity::getExecutedAt,
                java.util.Comparator.nullsFirst(java.util.Comparator.naturalOrder())));
        for (SqlHistoryEntity entity : ordered) {
            if (entity.getId() == null || entity.getId().isBlank()) {
                continue;
            }
            if (ownIds.contains(entity.getId())) {
                continue;
            }
            // Fresh id — JDBC save updates by primary key and must never rewrite another account's row.
            entity.setId("h-" + UUID.randomUUID());
            entity.setUserId(userId);
            entity.setTenantId(tenantId);
            workspaceStore.saveSqlHistory(entity);
            ownIds.add(entity.getId());
            count++;
        }
        return count;
    }

    private void extractConnectionSecrets(
                                          ConnectionEntity connection,
                                          Map<String, String> sealedSecrets,
                                          List<String> warnings) {
        String id = connection.getId();
        extractField(id, "password", connection.getPassword(), sealedSecrets, warnings, connection::setPassword);
        extractField(id, "sshPassword", connection.getSshPassword(), sealedSecrets, warnings, connection::setSshPassword);
        extractField(id, "sshPrivateKey", connection.getSshPrivateKey(), sealedSecrets, warnings, connection::setSshPrivateKey);
        extractField(id, "sshPassphrase", connection.getSshPassphrase(), sealedSecrets, warnings, connection::setSshPassphrase);
        extractField(id, "jumpPrivateKey", connection.getJumpPrivateKey(), sealedSecrets, warnings, connection::setJumpPrivateKey);
        extractField(id, "jumpPassphrase", connection.getJumpPassphrase(), sealedSecrets, warnings, connection::setJumpPassphrase);
        extractField(id, "pluginSecrets", connection.getPluginSecrets(), sealedSecrets, warnings, connection::setPluginSecrets);
    }

    private void extractField(
                              String connectionId,
                              String field,
                              String value,
                              Map<String, String> sealedSecrets,
                              List<String> warnings,
                              java.util.function.Consumer<String> clearer) {
        if (value == null || value.isBlank()) {
            return;
        }
        if (secretValueCodec.isSecretReference(value)) {
            warnings.add("SECRET_REF_PRESERVED:connection." + connectionId + "." + field);
            return;
        }
        String plaintext = secretValueCodec.isEncrypted(value) ? secretValueCodec.decryptForUse(value) : value;
        sealedSecrets.put("connection." + connectionId + "." + field, plaintext);
        clearer.accept("");
    }

    @SuppressWarnings("unchecked")
    private void extractAiSecrets(
                                  Map<String, Object> config,
                                  Map<String, String> sealedSecrets,
                                  List<String> warnings) {
        Object aiRaw = config.get("ai");
        if (!(aiRaw instanceof Map<?, ?>)) {
            return;
        }
        Map<String, Object> ai = (Map<String, Object>) aiRaw;
        extractAiProfiles(ai, "llmProfiles", sealedSecrets, warnings);
        extractAiProfiles(ai, "embeddingProfiles", sealedSecrets, warnings);
        extractAiMapKey(ai, "embedding", "apiKey", "ai.embedding.apiKey", sealedSecrets, warnings);
        extractAiMapKey(ai, "llm", "apiKey", "ai.llm.apiKey", sealedSecrets, warnings);
        Object rag = ai.get("rag");
        if (rag instanceof Map<?, ?> ragMap) {
            Object pg = ((Map<?, ?>) ragMap).get("pgvector");
            if (pg instanceof Map<?, ?> pgMap) {
                Map<String, Object> writable = (Map<String, Object>) pgMap;
                Object password = writable.get("password");
                if (password instanceof String text && !text.isBlank()) {
                    if (secretValueCodec.isSecretReference(text)) {
                        warnings.add("SECRET_REF_PRESERVED:ai.rag.pgvector.password");
                    } else {
                        String plaintext = secretValueCodec.isEncrypted(text)
                                ? secretValueCodec.decryptForUse(text)
                                : text;
                        sealedSecrets.put("ai.rag.pgvector.password", plaintext);
                        writable.put("password", "");
                    }
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void extractAiProfiles(
                                   Map<String, Object> ai,
                                   String listKey,
                                   Map<String, String> sealedSecrets,
                                   List<String> warnings) {
        Object raw = ai.get(listKey);
        if (!(raw instanceof List<?> list)) {
            return;
        }
        for (int i = 0; i < list.size(); i++) {
            Object item = list.get(i);
            if (!(item instanceof Map<?, ?>)) {
                continue;
            }
            Map<String, Object> profile = (Map<String, Object>) item;
            Object apiKey = profile.get("apiKey");
            if (!(apiKey instanceof String text) || text.isBlank()) {
                continue;
            }
            String path = "ai." + listKey + "[" + i + "].apiKey";
            if (secretValueCodec.isSecretReference(text)) {
                warnings.add("SECRET_REF_PRESERVED:" + path);
                continue;
            }
            String plaintext = secretValueCodec.isEncrypted(text) ? secretValueCodec.decryptForUse(text) : text;
            sealedSecrets.put(path, plaintext);
            profile.put("apiKey", "");
        }
    }

    @SuppressWarnings("unchecked")
    private void extractAiMapKey(
                                 Map<String, Object> ai,
                                 String mapKey,
                                 String field,
                                 String sealedKey,
                                 Map<String, String> sealedSecrets,
                                 List<String> warnings) {
        Object raw = ai.get(mapKey);
        if (!(raw instanceof Map<?, ?>)) {
            return;
        }
        Map<String, Object> map = (Map<String, Object>) raw;
        Object value = map.get(field);
        if (!(value instanceof String text) || text.isBlank()) {
            return;
        }
        if (secretValueCodec.isSecretReference(text)) {
            warnings.add("SECRET_REF_PRESERVED:" + sealedKey);
            return;
        }
        String plaintext = secretValueCodec.isEncrypted(text) ? secretValueCodec.decryptForUse(text) : text;
        sealedSecrets.put(sealedKey, plaintext);
        map.put(field, "");
    }

    private void applyConnectionSecrets(List<ConnectionEntity> connections, Map<String, String> secrets) {
        if (connections == null || secrets == null) {
            return;
        }
        for (ConnectionEntity connection : connections) {
            String id = connection.getId();
            String password = secrets.get("connection." + id + ".password");
            if (password != null) {
                connection.setPassword(password);
            }
            String sshPassword = secrets.get("connection." + id + ".sshPassword");
            if (sshPassword != null) {
                connection.setSshPassword(sshPassword);
            }
            String sshPrivateKey = secrets.get("connection." + id + ".sshPrivateKey");
            if (sshPrivateKey != null) {
                connection.setSshPrivateKey(sshPrivateKey);
            }
            String sshPassphrase = secrets.get("connection." + id + ".sshPassphrase");
            if (sshPassphrase != null) {
                connection.setSshPassphrase(sshPassphrase);
            }
            String jumpPrivateKey = secrets.get("connection." + id + ".jumpPrivateKey");
            if (jumpPrivateKey != null) {
                connection.setJumpPrivateKey(jumpPrivateKey);
            }
            String jumpPassphrase = secrets.get("connection." + id + ".jumpPassphrase");
            if (jumpPassphrase != null) {
                connection.setJumpPassphrase(jumpPassphrase);
            }
            String pluginSecrets = secrets.get("connection." + id + ".pluginSecrets");
            if (pluginSecrets != null) {
                connection.setPluginSecrets(pluginSecrets);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void applyAiSecrets(Map<String, Object> config, Map<String, String> secrets) {
        if (config == null || secrets == null || secrets.isEmpty()) {
            return;
        }
        Object aiRaw = config.get("ai");
        if (!(aiRaw instanceof Map<?, ?>)) {
            return;
        }
        Map<String, Object> ai = (Map<String, Object>) aiRaw;
        applyAiProfileSecrets(ai, "llmProfiles", secrets);
        applyAiProfileSecrets(ai, "embeddingProfiles", secrets);
        applyAiMapSecret(ai, "embedding", "apiKey", secrets.get("ai.embedding.apiKey"));
        applyAiMapSecret(ai, "llm", "apiKey", secrets.get("ai.llm.apiKey"));
        String ragPassword = secrets.get("ai.rag.pgvector.password");
        if (ragPassword != null) {
            Object rag = ai.get("rag");
            if (rag instanceof Map<?, ?> ragMap) {
                Object pg = ((Map<?, ?>) ragMap).get("pgvector");
                if (pg instanceof Map<?, ?>) {
                    ((Map<String, Object>) pg).put("password", ragPassword);
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void applyAiProfileSecrets(Map<String, Object> ai, String listKey, Map<String, String> secrets) {
        Object raw = ai.get(listKey);
        if (!(raw instanceof List<?> list)) {
            return;
        }
        for (int i = 0; i < list.size(); i++) {
            Object item = list.get(i);
            if (!(item instanceof Map<?, ?>)) {
                continue;
            }
            String value = secrets.get("ai." + listKey + "[" + i + "].apiKey");
            if (value != null) {
                ((Map<String, Object>) item).put("apiKey", value);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void applyAiMapSecret(Map<String, Object> ai, String mapKey, String field, String value) {
        if (value == null) {
            return;
        }
        Object raw = ai.get(mapKey);
        if (raw instanceof Map<?, ?>) {
            ((Map<String, Object>) raw).put(field, value);
        }
    }

    private List<ProfileConflictItem> detectConflicts(ParsedPackage parsed, ProfileDomainOptions domains) throws Exception {
        List<ProfileConflictItem> conflicts = new ArrayList<>();
        if (domains.isConnections() && parsed.files().containsKey("payload/connections.xml")) {
            ConnectionsXmlCodec.ParsedCatalog incoming = ConnectionsXmlCodec.readXml(
                    new String(parsed.files().get("payload/connections.xml"), StandardCharsets.UTF_8),
                    objectMapper);
            Set<String> existingIds = new HashSet<>();
            Map<String, String> existingNames = new HashMap<>();
            for (ConnectionEntity connection : connectionStore.findAllConnections()) {
                existingIds.add(connection.getId());
                if (connection.getName() != null) {
                    existingNames.put(connection.getName().toLowerCase(Locale.ROOT), connection.getId());
                }
            }
            for (ConnectionEntity connection : incoming.connections()) {
                if (existingIds.contains(connection.getId())) {
                    conflicts.add(new ProfileConflictItem(
                            ProfileDomainOptions.CONNECTIONS,
                            connection.getId(),
                            connection.getName(),
                            "overwrite"));
                } else if (connection.getName() != null
                        && existingNames.containsKey(connection.getName().toLowerCase(Locale.ROOT))) {
                    conflicts.add(new ProfileConflictItem(
                            ProfileDomainOptions.CONNECTIONS,
                            connection.getId(),
                            connection.getName(),
                            "rename"));
                }
            }
        }
        if (domains.isApp() && parsed.files().containsKey("payload/app.xml")) {
            Map<String, Object> current = userAppConfigStore.readAppConfig(UserContext.requireUserId())
                    .orElse(Map.of());
            for (String section : AppConfigSections.JSON_SECTIONS) {
                if (current.containsKey(section)) {
                    conflicts.add(new ProfileConflictItem(ProfileDomainOptions.APP, section, section, "merge"));
                }
            }
        }
        return conflicts;
    }

    private Map<String, Object> buildImportCounts(ParsedPackage parsed, Map<String, String> secrets) throws Exception {
        Map<String, Object> counts = new LinkedHashMap<>();
        if (parsed.files().containsKey("payload/connections.xml")) {
            var catalog = ConnectionsXmlCodec.readXml(
                    new String(parsed.files().get("payload/connections.xml"), StandardCharsets.UTF_8),
                    objectMapper);
            counts.put("connections", catalog.connections().size());
        }
        if (parsed.files().containsKey("payload/app.xml")) {
            counts.put("app", 1);
        }
        int snippets = 0;
        if (parsed.files().containsKey("payload/sql-snippets.shared.json")) {
            snippets++;
        }
        if (parsed.files().containsKey("payload/sql-snippets.personal.json")) {
            snippets++;
        }
        if (snippets > 0) {
            counts.put("snippets", snippets);
        }
        long aiFiles = parsed.files().keySet().stream().filter(k -> k.startsWith("payload/ai/")).count();
        if (aiFiles > 0) {
            counts.put("aiWorkspaceFiles", aiFiles);
        }
        if (parsed.files().containsKey("payload/projects/index.json")) {
            counts.put("projects", 1);
        }
        if (parsed.files().containsKey("payload/saved-consoles.json")) {
            try {
                List<?> consoles = objectMapper.readValue(
                        parsed.files().get("payload/saved-consoles.json"),
                        List.class);
                counts.put("savedConsoles", consoles.size());
            } catch (Exception ignored) {
                counts.put("savedConsoles", 1);
            }
        }
        if (parsed.files().containsKey("payload/sql-history.json")) {
            try {
                List<?> history = objectMapper.readValue(
                        parsed.files().get("payload/sql-history.json"),
                        List.class);
                counts.put("sqlHistory", history.size());
            } catch (Exception ignored) {
                counts.put("sqlHistory", 1);
            }
        }
        counts.put("sealedSecretFields", secrets.size());
        return counts;
    }

    private static boolean isOmittedSecretMode(ProfileManifest manifest) {
        return manifest != null && ProfileManifest.SECRET_MODE_OMITTED.equals(manifest.getSecretMode());
    }

    private static boolean isBlankSecret(String value) {
        return value == null || value.isBlank();
    }

    private static void preserveBlankSecretsFromLocal(ConnectionEntity incoming, ConnectionEntity local) {
        if (incoming == null || local == null) {
            return;
        }
        if (isBlankSecret(incoming.getPassword())) {
            incoming.setPassword(local.getPassword());
        }
        if (isBlankSecret(incoming.getSshPassword())) {
            incoming.setSshPassword(local.getSshPassword());
        }
        if (isBlankSecret(incoming.getSshPrivateKey())) {
            incoming.setSshPrivateKey(local.getSshPrivateKey());
        }
        if (isBlankSecret(incoming.getSshPassphrase())) {
            incoming.setSshPassphrase(local.getSshPassphrase());
        }
        if (isBlankSecret(incoming.getJumpPrivateKey())) {
            incoming.setJumpPrivateKey(local.getJumpPrivateKey());
        }
        if (isBlankSecret(incoming.getJumpPassphrase())) {
            incoming.setJumpPassphrase(local.getJumpPassphrase());
        }
        if (isBlankSecret(incoming.getPluginSecrets())) {
            incoming.setPluginSecrets(local.getPluginSecrets());
        }
    }

    private Map<String, String> unsealSecrets(ParsedPackage parsed, String passphrase) throws Exception {
        byte[] sealed = parsed.files().get("secrets/sealed.bin");
        byte[] kdfBytes = parsed.files().get("secrets/kdf.json");
        if (sealed == null || kdfBytes == null) {
            return Map.of();
        }
        Map<String, Object> kdf = objectMapper.readValue(kdfBytes, new TypeReference<>() {
        });
        String json = ProfilePassphraseCrypto.unseal(passphrase, sealed, kdf);
        return objectMapper.readValue(json, new TypeReference<>() {
        });
    }

    private ParsedPackage parsePackage(byte[] packageBytes) throws IOException {
        if (packageBytes == null || packageBytes.length == 0) {
            throw new IllegalArgumentException("PACKAGE_REQUIRED");
        }
        String asText = ProfilePackageZipCodec.peekText(packageBytes);
        if (asText != null && asText.trim().startsWith("{")) {
            Map<String, Object> json = objectMapper.readValue(packageBytes, new TypeReference<>() {
            });
            if ("datawise-config-snapshot".equals(json.get("kind"))) {
                Map<String, byte[]> files = new LinkedHashMap<>();
                files.put("legacy/snapshot.json", packageBytes);
                ProfileManifest manifest = new ProfileManifest();
                manifest.setKind(ProfileManifest.KIND);
                manifest.setSchemaVersion(ProfileManifest.SCHEMA_VERSION);
                manifest.setDomains(List.of(ProfileDomainOptions.CONNECTIONS));
                Map<String, Object> counts = new LinkedHashMap<>();
                if (json.get("connections") instanceof List<?> list) {
                    counts.put("connections", list.size());
                }
                return new ParsedPackage(manifest, files, List.of("LEGACY_SNAPSHOT"), "datawise-config-snapshot", counts);
            }
        }
        if (asText != null && asText.contains("<datawise-app")) {
            Map<String, byte[]> files = new LinkedHashMap<>();
            files.put("legacy/app.xml", packageBytes);
            ProfileManifest manifest = new ProfileManifest();
            manifest.setKind(ProfileManifest.KIND);
            manifest.setSchemaVersion(ProfileManifest.SCHEMA_VERSION);
            manifest.setDomains(List.of(ProfileDomainOptions.APP));
            return new ParsedPackage(manifest, files, List.of("LEGACY_APP_XML"), "datawise-app-xml", Map.of("app", 1));
        }

        Map<String, byte[]> files = ProfilePackageZipCodec.unzip(packageBytes);
        ProfileManifest manifest = null;
        byte[] manifestBytes = files.get("manifest.json");
        if (manifestBytes != null) {
            manifest = objectMapper.readValue(manifestBytes, ProfileManifest.class);
        }
        return new ParsedPackage(manifest, files, new ArrayList<>(), null, Map.of());
    }

    private ConnectionEntity copyConnection(ConnectionEntity source) {
        return objectMapper.convertValue(source, ConnectionEntity.class);
    }

    private static int countAiSecretKeys(Map<String, String> sealedSecrets) {
        int count = 0;
        for (String key : sealedSecrets.keySet()) {
            if (key.startsWith("ai.")) {
                count++;
            }
        }
        return count;
    }

    private static String resolveAppVersion() {
        Package pkg = ProfilePortabilityService.class.getPackage();
        String version = pkg != null ? pkg.getImplementationVersion() : null;
        return version != null && !version.isBlank() ? version : "dev";
    }

    private void assertPassphraseNotLocked(long userId) {
        AttemptWindow window = passphraseAttempts.get(userId);
        if (window == null) {
            return;
        }
        if (window.failures >= MAX_PASSPHRASE_FAILURES
                && System.currentTimeMillis() - window.firstFailureAt < PASSPHRASE_LOCK_MS) {
            throw new IllegalArgumentException("PASSPHRASE_LOCKED");
        }
        if (System.currentTimeMillis() - window.firstFailureAt >= PASSPHRASE_LOCK_MS) {
            passphraseAttempts.remove(userId);
        }
    }

    private void recordPassphraseFailure(long userId) {
        passphraseAttempts.compute(userId, (id, existing) -> {
            long now = System.currentTimeMillis();
            if (existing == null || now - existing.firstFailureAt >= PASSPHRASE_LOCK_MS) {
                return new AttemptWindow(1, now);
            }
            return new AttemptWindow(existing.failures + 1, existing.firstFailureAt);
        });
    }

    private void clearPassphraseFailures(long userId) {
        passphraseAttempts.remove(userId);
    }

    private record AttemptWindow(int failures, long firstFailureAt) {
    }

    private record ParsedPackage(
            ProfileManifest manifest,
            Map<String, byte[]> files,
            List<String> warnings,
            String legacyKind,
            Map<String, Object> counts) {
    }
}
