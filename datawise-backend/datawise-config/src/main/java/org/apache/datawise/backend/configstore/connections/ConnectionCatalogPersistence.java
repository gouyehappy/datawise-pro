package org.apache.datawise.backend.configstore.connections;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.apache.datawise.backend.common.support.XmlConfigSupport;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.ConnectionSecrets;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * connections.xml 读写、导入与密钥加解密（按当前租户路径隔离）。
 * <p>
 * 当 {@code splitConnections} 为 true 时，按项目拆分到
 * {@code tenants/{tid}/projects/{pid}/connections.xml}，读时合并为统一 catalog。
 */
public final class ConnectionCatalogPersistence {

    private static final Logger log = LoggerFactory.getLogger(ConnectionCatalogPersistence.class);

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final SecretValueCodec secretValueCodec;
    private final boolean splitConnections;
    private final ConcurrentHashMap<String, ConnectionCatalogCache> caches = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> loadLocks = new ConcurrentHashMap<>();

    public ConnectionCatalogPersistence(
                                        ConfigDirectoryService configDirectory,
                                        ObjectMapper objectMapper,
                                        SecretValueCodec secretValueCodec,
                                        ConnectionCatalogCache ignoredLegacyCache) {
        this(configDirectory, objectMapper, secretValueCodec, false);
    }

    public ConnectionCatalogPersistence(
                                        ConfigDirectoryService configDirectory,
                                        ObjectMapper objectMapper,
                                        SecretValueCodec secretValueCodec) {
        this(configDirectory, objectMapper, secretValueCodec, false);
    }

    public ConnectionCatalogPersistence(
                                        ConfigDirectoryService configDirectory,
                                        ObjectMapper objectMapper,
                                        SecretValueCodec secretValueCodec,
                                        boolean splitConnections) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.secretValueCodec = secretValueCodec;
        this.splitConnections = splitConnections;
        TenantScopedConfigSupport.ensureConnectionsPath(configDirectory, TenantIds.DEFAULT);
    }

    public boolean isSplitConnections() {
        return splitConnections;
    }

    /** Ensure empty connections.xml parent dir exists for a tenant. */
    public void ensureTenantFiles(String tenantId) {
        String relative = TenantScopedConfigSupport.ensureConnectionsPath(configDirectory, tenantId);
        Path path = configDirectory.resolve(relative);
        try {
            Files.createDirectories(path.getParent());
            if (!Files.isRegularFile(path) && !splitConnections) {
                ConnectionsXmlCodec.write(path, List.of(), List.of(), objectMapper);
            }
            if (splitConnections) {
                maybeMigrateUnifiedToSplit(tenantId);
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to ensure connections.xml for tenant " + tenantId, ex);
        }
    }

    private String currentTenantId() {
        return TenantScopedConfigSupport.currentTenantId();
    }

    private String connectionsRelativePath() {
        return TenantScopedConfigSupport.ensureCurrentConnectionsPath(configDirectory);
    }

    private ConnectionCatalogCache cacheForCurrent() {
        return caches.computeIfAbsent(currentTenantId(), ignored -> new ConnectionCatalogCache());
    }

    private Object loadLockForCurrent() {
        return loadLocks.computeIfAbsent(currentTenantId(), ignored -> new Object());
    }

    public Path connectionsFilePath() {
        return configDirectory.resolve(connectionsRelativePath());
    }

    public String readConnectionsXml() throws IOException {
        if (splitConnections) {
            ConnectionsXmlCodec.ParsedCatalog catalog = loadDecryptedCatalog();
            List<ConnectionEntity> encrypted = new ArrayList<>(catalog.connections());
            ConnectionSecrets.encryptAll(encrypted, secretValueCodec);
            return ConnectionsXmlCodec.writeToString(catalog.groups(), encrypted, objectMapper);
        }
        Path path = connectionsFilePath();
        if (!ConnectionsXmlCodec.isRegularFile(path)) {
            return "";
        }
        return ConnectionsXmlCodec.readUtf8(path);
    }

    public ConnectionsXmlCodec.ParsedCatalog loadDecryptedCatalog() {
        return requireEntry().catalog();
    }

    public Optional<ConnectionEntity> findConnectionById(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(requireEntry().connectionsById().get(connectionId));
    }

    public Optional<ConnectionGroupEntity> findGroupById(String groupId) {
        if (groupId == null || groupId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(requireEntry().groupsById().get(groupId));
    }

    public List<ConnectionEntity> findConnectionsByGroupId(String groupId) {
        if (groupId == null || groupId.isBlank()) {
            return List.of();
        }
        return requireEntry().connectionsByGroupId().getOrDefault(groupId, List.of());
    }

    private ConnectionCatalogCache.Entry requireEntry() {
        try {
            if (splitConnections) {
                maybeMigrateUnifiedToSplit(currentTenantId());
            }
            long version = catalogVersionStamp();
            ConnectionCatalogCache cache = cacheForCurrent();
            ConnectionCatalogCache.Entry cached = cache.getIfFresh(version);
            if (cached != null) {
                return cached;
            }
            synchronized (loadLockForCurrent()) {
                ConnectionCatalogCache.Entry again = cache.getIfFresh(version);
                if (again != null) {
                    return again;
                }
                ConnectionsXmlCodec.ParsedCatalog raw = loadMergedRawCatalog();
                List<ConnectionEntity> connections = new ArrayList<>(raw.connections());
                ConnectionSecrets.decryptAll(connections, secretValueCodec);
                ConnectionsXmlCodec.ParsedCatalog catalog = new ConnectionsXmlCodec.ParsedCatalog(
                        new ArrayList<>(raw.groups()),
                        connections);
                return cache.putAndGet(version, catalog);
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read " + ConfigPaths.CONNECTIONS, ex);
        }
    }

    ConnectionsXmlCodec.ParsedCatalog loadRawCatalog() {
        try {
            return loadMergedRawCatalog();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read " + ConfigPaths.CONNECTIONS, ex);
        }
    }

    public synchronized void replaceAll(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
        writeCatalog(
                groups != null ? new ArrayList<>(groups) : new ArrayList<>(),
                connections != null ? new ArrayList<>(connections) : new ArrayList<>());
    }

    public synchronized void importConnectionsXml(String xml) throws IOException {
        if (xml == null || xml.isBlank()) {
            replaceAll(List.of(), List.of());
            return;
        }
        try {
            var factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            var document = factory.newDocumentBuilder()
                    .parse(new java.io.ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
            Path temp = configDirectory.resolve(".__connections-import.xml");
            XmlConfigSupport.writeDocument(temp, document);
            ConnectionsXmlCodec.ParsedCatalog parsed = ConnectionsXmlCodec.read(temp, objectMapper);
            Files.deleteIfExists(temp);
            writeCatalog(parsed.groups(), parsed.connections());
        } catch (IOException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IOException("Invalid connections.xml", ex);
        }
    }

    public synchronized int migratePlaintextSecretsIfNeeded() {
        ConnectionsXmlCodec.ParsedCatalog catalog = loadRawCatalog();
        int plaintextFields = ConnectionSecrets.countPlaintextFields(catalog.connections(), secretValueCodec);
        if (plaintextFields == 0) {
            return 0;
        }
        writeCatalog(catalog.groups(), catalog.connections());
        return plaintextFields;
    }

    synchronized void mutate(Consumer<MutableConnectionCatalog> mutation) {
        cacheForCurrent().invalidate();
        MutableConnectionCatalog catalog = MutableConnectionCatalog.from(loadDecryptedCatalog());
        mutation.accept(catalog);
        writeCatalog(catalog.groups(), catalog.connections());
    }

    public synchronized ConnectionGroupEntity upsertGroup(ConnectionGroupEntity group) {
        mutate(catalog -> {
            catalog.groups().removeIf(existing -> existing.getId().equals(group.getId()));
            catalog.groups().add(group);
        });
        return group;
    }

    public synchronized void removeGroup(String groupId) {
        mutate(catalog -> catalog.groups().removeIf(group -> groupId.equals(group.getId())));
    }

    public synchronized ConnectionEntity upsertConnection(ConnectionEntity connection) {
        mutate(catalog -> {
            catalog.connections().removeIf(existing -> existing.getId().equals(connection.getId()));
            catalog.connections().add(connection);
        });
        return connection;
    }

    public synchronized void removeConnection(String connectionId) {
        mutate(catalog -> catalog.connections().removeIf(connection -> connectionId.equals(connection.getId())));
    }

    private void writeCatalog(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
        try {
            configDirectory.ensureExists();
            List<ConnectionEntity> toWrite = new ArrayList<>(connections);
            ConnectionSecrets.encryptAll(toWrite, secretValueCodec);
            if (!splitConnections) {
                ConnectionsXmlCodec.write(connectionsFilePath(), groups, toWrite, objectMapper);
            } else {
                writeSplitCatalog(currentTenantId(), groups, toWrite);
            }
            cacheForCurrent().invalidate();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to persist " + ConfigPaths.CONNECTIONS, ex);
        }
    }

    private void writeSplitCatalog(
                                   String tenantId,
                                   List<ConnectionGroupEntity> groups,
                                   List<ConnectionEntity> connections) throws IOException {
        String id = TenantIds.normalizeOrDefault(tenantId);
        ProjectConnectionsSplitSupport.PartitionedCatalog partitioned =
                ProjectConnectionsSplitSupport.partition(groups, connections);
        Path projectsRoot = configDirectory.resolve(ConfigPaths.tenantProjectsDir(id));
        Files.createDirectories(projectsRoot);

        // Remove project connection files that no longer have entries (keep docs/scripts).
        if (Files.isDirectory(projectsRoot)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(projectsRoot)) {
                for (Path projectDir : stream) {
                    if (!Files.isDirectory(projectDir)) {
                        continue;
                    }
                    String projectId = projectDir.getFileName().toString();
                    if (!partitioned.connectionsByProject().containsKey(projectId)
                            && !partitioned.groupsByProject().containsKey(projectId)) {
                        Files.deleteIfExists(projectDir.resolve(ConfigPaths.CONNECTIONS));
                    }
                }
            }
        }

        for (Map.Entry<String, List<ConnectionEntity>> entry : partitioned.connectionsByProject().entrySet()) {
            String projectId = entry.getKey();
            List<ConnectionGroupEntity> projectGroups =
                    partitioned.groupsByProject().getOrDefault(projectId, List.of());
            Path file = configDirectory.resolve(ConfigPaths.tenantProjectConnections(id, projectId));
            Files.createDirectories(file.getParent());
            ConnectionsXmlCodec.write(file, projectGroups, entry.getValue(), objectMapper);
        }
        for (Map.Entry<String, List<ConnectionGroupEntity>> entry : partitioned.groupsByProject().entrySet()) {
            if (partitioned.connectionsByProject().containsKey(entry.getKey())) {
                continue;
            }
            Path file = configDirectory.resolve(ConfigPaths.tenantProjectConnections(id, entry.getKey()));
            Files.createDirectories(file.getParent());
            ConnectionsXmlCodec.write(file, entry.getValue(), List.of(), objectMapper);
        }

        Path legacy = configDirectory.resolve(TenantScopedConfigSupport.ensureConnectionsPath(configDirectory, id));
        if (Files.isRegularFile(legacy)) {
            Path migrated = legacy.resolveSibling(ConfigPaths.CONNECTIONS + ConfigPaths.CONNECTIONS_MIGRATED_SUFFIX);
            Files.move(legacy, migrated, StandardCopyOption.REPLACE_EXISTING);
            log.info("Moved unified connections.xml to {} after split write (tenant={})", migrated, id);
        }
        caches.computeIfAbsent(id, ignored -> new ConnectionCatalogCache()).invalidate();
    }

    private ConnectionsXmlCodec.ParsedCatalog loadMergedRawCatalog() throws IOException {
        if (!splitConnections) {
            Path xmlPath = connectionsFilePath();
            if (!ConnectionsXmlCodec.isRegularFile(xmlPath)) {
                return emptyCatalog();
            }
            return ConnectionsXmlCodec.read(xmlPath, objectMapper);
        }
        List<ConnectionsXmlCodec.ParsedCatalog> parts = new ArrayList<>();
        Path legacy = connectionsFilePath();
        if (ConnectionsXmlCodec.isRegularFile(legacy)) {
            parts.add(ConnectionsXmlCodec.read(legacy, objectMapper));
        }
        Path projectsRoot = configDirectory.resolve(ConfigPaths.tenantProjectsDir(currentTenantId()));
        if (Files.isDirectory(projectsRoot)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(projectsRoot)) {
                for (Path projectDir : stream) {
                    if (!Files.isDirectory(projectDir)) {
                        continue;
                    }
                    Path file = projectDir.resolve(ConfigPaths.CONNECTIONS);
                    if (ConnectionsXmlCodec.isRegularFile(file)) {
                        parts.add(ConnectionsXmlCodec.read(file, objectMapper));
                    }
                }
            }
        }
        if (parts.isEmpty()) {
            return emptyCatalog();
        }
        return ProjectConnectionsSplitSupport.merge(parts);
    }

    private long catalogVersionStamp() throws IOException {
        long stamp = 0L;
        Path legacy = connectionsFilePath();
        if (ConnectionsXmlCodec.isRegularFile(legacy)) {
            stamp ^= Files.getLastModifiedTime(legacy).toMillis();
        }
        if (!splitConnections) {
            return stamp;
        }
        Path projectsRoot = configDirectory.resolve(ConfigPaths.tenantProjectsDir(currentTenantId()));
        if (!Files.isDirectory(projectsRoot)) {
            return stamp;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(projectsRoot)) {
            for (Path projectDir : stream) {
                Path file = projectDir.resolve(ConfigPaths.CONNECTIONS);
                if (ConnectionsXmlCodec.isRegularFile(file)) {
                    stamp ^= Files.getLastModifiedTime(file).toMillis();
                    stamp = Long.rotateLeft(stamp, 7);
                }
            }
        }
        return stamp;
    }

    /**
     * One-shot: if split mode and only unified file has data, partition and rename unified to .migrated.
     */
    private void maybeMigrateUnifiedToSplit(String tenantId) throws IOException {
        Path legacy = configDirectory.resolve(TenantScopedConfigSupport.ensureConnectionsPath(configDirectory, tenantId));
        if (!ConnectionsXmlCodec.isRegularFile(legacy)) {
            return;
        }
        Path projectsRoot = configDirectory.resolve(ConfigPaths.tenantProjectsDir(tenantId));
        if (hasAnyProjectConnectionsFile(projectsRoot)) {
            return;
        }
        ConnectionsXmlCodec.ParsedCatalog catalog = ConnectionsXmlCodec.read(legacy, objectMapper);
        if ((catalog.connections() == null || catalog.connections().isEmpty())
                && (catalog.groups() == null || catalog.groups().isEmpty())) {
            return;
        }
        log.info("Migrating unified connections.xml to per-project files for tenant {}", tenantId);
        // Stamp missing project ids to default before partition.
        List<ConnectionGroupEntity> groups = new ArrayList<>(catalog.groups());
        for (ConnectionGroupEntity group : groups) {
            if (group.getProjectId() == null || group.getProjectId().isBlank()) {
                group.setProjectId(ProjectIds.DEFAULT);
            }
        }
        List<ConnectionEntity> connections = new ArrayList<>(catalog.connections());
        for (ConnectionEntity connection : connections) {
            if (connection.getProjectId() == null || connection.getProjectId().isBlank()) {
                connection.setProjectId(ProjectIds.DEFAULT);
            }
        }
        writeSplitCatalog(tenantId, groups, connections);
    }

    private static boolean hasAnyProjectConnectionsFile(Path projectsRoot) throws IOException {
        if (!Files.isDirectory(projectsRoot)) {
            return false;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(projectsRoot)) {
            for (Path projectDir : stream) {
                if (Files.isDirectory(projectDir)
                        && ConnectionsXmlCodec.isRegularFile(projectDir.resolve(ConfigPaths.CONNECTIONS))) {
                    return true;
                }
            }
        }
        return false;
    }

    private static ConnectionsXmlCodec.ParsedCatalog emptyCatalog() {
        return new ConnectionsXmlCodec.ParsedCatalog(List.of(), List.of());
    }
}
