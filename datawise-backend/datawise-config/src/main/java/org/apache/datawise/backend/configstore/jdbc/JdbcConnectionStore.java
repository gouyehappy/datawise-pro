package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.apache.datawise.backend.common.ConnectionCatalogConflictException;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.configstore.connections.ConnectionCatalogCache;
import org.apache.datawise.backend.configstore.connections.MutableConnectionCatalog;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.ConnectionSecrets;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * Connection catalog backed by {@code dw_connection_snapshots} (XML payload per tenant).
 * Writes use optimistic {@code version} CAS so multi-instance deployments do not silently overwrite.
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcConnectionStore implements ConnectionStore {

    public static final String CONNECTION_CATALOG_CONFLICT = DatawiseErrorCodes.CONNECTION_CATALOG_CONFLICT;

    private static final String EMPTY_XML = """
            <?xml version="1.0" encoding="UTF-8"?>
            <datawise-connections version="1"/>
            """;

    private final JdbcTemplate jdbc;
    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final SecretValueCodec secretValueCodec;
    private final ConcurrentHashMap<String, ConnectionCatalogCache> caches = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> loadLocks = new ConcurrentHashMap<>();

    public JdbcConnectionStore(
                               @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                               ConfigDirectoryService configDirectory,
                               ObjectMapper objectMapper,
                               SecretValueCodec secretValueCodec) {
        this.jdbc = jdbc;
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.secretValueCodec = secretValueCodec;
    }

    @PostConstruct
    void initDefaultTenantSnapshot() {
        ensureTenantFiles(TenantIds.DEFAULT);
    }

    @Override
    public void ensureTenantFiles(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        if (!snapshotExists(id)) {
            insertPayload(id, EMPTY_XML);
        }
    }

    @Override
    public Path connectionsFilePath() {
        // Logical export path (data lives in JDBC); kept for API compatibility.
        return configDirectory.resolve(
                TenantScopedConfigSupport.connectionsPath(TenantScopedConfigSupport.currentTenantId()));
    }

    @Override
    public String readConnectionsXml() {
        return loadSnapshot(currentTenantId()).payload();
    }

    @Override
    public List<ConnectionGroupEntity> findAllGroups() {
        return sortedGroups(requireEntry().catalog());
    }

    @Override
    public List<ConnectionEntity> findAllConnections() {
        return sortedConnections(requireEntry().catalog());
    }

    @Override
    public List<ConnectionGroupEntity> findRootGroups() {
        return requireEntry().catalog().groups().stream()
                .filter(group -> group.getParentId() == null)
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                .toList();
    }

    @Override
    public List<ConnectionGroupEntity> findChildGroups(String parentId) {
        return requireEntry().catalog().groups().stream()
                .filter(group -> parentId.equals(group.getParentId()))
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                .toList();
    }

    @Override
    public synchronized void replaceAll(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
        SnapshotRow row = loadSnapshot(currentTenantId());
        writeCatalog(
                groups != null ? new ArrayList<>(groups) : new ArrayList<>(),
                connections != null ? new ArrayList<>(connections) : new ArrayList<>(),
                row.version());
    }

    @Override
    public synchronized void importConnectionsXml(String xml) throws IOException {
        if (xml == null || xml.isBlank()) {
            replaceAll(List.of(), List.of());
            return;
        }
        try {
            ConnectionsXmlCodec.ParsedCatalog parsed = parseXml(xml);
            SnapshotRow row = loadSnapshot(currentTenantId());
            writeCatalog(parsed.groups(), parsed.connections(), row.version());
        } catch (ConnectionCatalogConflictException ex) {
            throw ex;
        } catch (IllegalStateException ex) {
            throw new IOException("Invalid connections.xml", ex);
        }
    }

    @Override
    public Optional<ConnectionGroupEntity> findGroupById(String groupId) {
        if (groupId == null || groupId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(requireEntry().groupsById().get(groupId));
    }

    @Override
    public synchronized ConnectionGroupEntity saveGroup(ConnectionGroupEntity group) {
        mutate(catalog -> {
            catalog.groups().removeIf(existing -> existing.getId().equals(group.getId()));
            catalog.groups().add(group);
        });
        return group;
    }

    @Override
    public synchronized void deleteGroupById(String groupId) {
        mutate(catalog -> catalog.groups().removeIf(group -> groupId.equals(group.getId())));
    }

    @Override
    public Optional<ConnectionEntity> findConnectionById(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(requireEntry().connectionsById().get(connectionId));
    }

    @Override
    public List<ConnectionEntity> findConnectionsByGroupId(String groupId) {
        if (groupId == null || groupId.isBlank()) {
            return List.of();
        }
        return requireEntry().connectionsByGroupId().getOrDefault(groupId, List.of());
    }

    @Override
    public synchronized ConnectionEntity saveConnection(ConnectionEntity connection) {
        mutate(catalog -> {
            catalog.connections().removeIf(existing -> existing.getId().equals(connection.getId()));
            catalog.connections().add(connection);
        });
        return connection;
    }

    @Override
    public synchronized void deleteConnectionById(String connectionId) {
        mutate(catalog -> catalog.connections().removeIf(connection -> connectionId.equals(connection.getId())));
    }

    @Override
    public synchronized int migratePlaintextSecretsIfNeeded() {
        SnapshotRow row = loadSnapshot(currentTenantId());
        ConnectionsXmlCodec.ParsedCatalog catalog = parseXml(row.payload());
        int plaintextFields = ConnectionSecrets.countPlaintextFields(catalog.connections(), secretValueCodec);
        if (plaintextFields == 0) {
            return 0;
        }
        writeCatalog(catalog.groups(), catalog.connections(), row.version());
        return plaintextFields;
    }

    /** Used by file→jdbc import (force overwrite; bumps version). */
    public synchronized void replaceXmlPayload(String tenantId, String xml) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        forceWritePayload(id, xml != null && !xml.isBlank() ? xml : EMPTY_XML);
        caches.computeIfAbsent(id, ignored -> new ConnectionCatalogCache()).invalidate();
    }

    private void mutate(Consumer<MutableConnectionCatalog> mutation) {
        SnapshotRow row = loadSnapshot(currentTenantId());
        cacheForCurrent().invalidate();
        ConnectionsXmlCodec.ParsedCatalog raw = parseXml(row.payload());
        List<ConnectionEntity> connections = new ArrayList<>(raw.connections());
        ConnectionSecrets.decryptAll(connections, secretValueCodec);
        MutableConnectionCatalog catalog = MutableConnectionCatalog.from(
                new ConnectionsXmlCodec.ParsedCatalog(new ArrayList<>(raw.groups()), connections));
        mutation.accept(catalog);
        writeCatalog(catalog.groups(), catalog.connections(), row.version());
    }

    private ConnectionCatalogCache.Entry requireEntry() {
        String tenantId = currentTenantId();
        ConnectionCatalogCache cache = cacheForCurrent();
        SnapshotRow row = loadSnapshot(tenantId);
        ConnectionCatalogCache.Entry cached = cache.getIfFresh(row.version());
        if (cached != null) {
            return cached;
        }
        synchronized (loadLockFor(tenantId)) {
            SnapshotRow againRow = loadSnapshot(tenantId);
            ConnectionCatalogCache.Entry again = cache.getIfFresh(againRow.version());
            if (again != null) {
                return again;
            }
            ConnectionsXmlCodec.ParsedCatalog raw = parseXml(againRow.payload());
            List<ConnectionEntity> connections = new ArrayList<>(raw.connections());
            ConnectionSecrets.decryptAll(connections, secretValueCodec);
            ConnectionsXmlCodec.ParsedCatalog catalog = new ConnectionsXmlCodec.ParsedCatalog(
                    new ArrayList<>(raw.groups()),
                    connections);
            return cache.putAndGet(againRow.version(), catalog);
        }
    }

    private void writeCatalog(
                              List<ConnectionGroupEntity> groups,
                              List<ConnectionEntity> connections,
                              long expectedVersion) {
        try {
            List<ConnectionEntity> toWrite = new ArrayList<>(connections);
            ConnectionSecrets.encryptAll(toWrite, secretValueCodec);
            String xml = ConnectionsXmlCodec.writeToString(groups, toWrite, objectMapper);
            writePayloadCas(currentTenantId(), xml, expectedVersion);
            cacheForCurrent().invalidate();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to persist connection catalog", ex);
        }
    }

    private ConnectionsXmlCodec.ParsedCatalog parseXml(String xml) {
        if (xml == null || xml.isBlank()) {
            return new ConnectionsXmlCodec.ParsedCatalog(List.of(), List.of());
        }
        try {
            return ConnectionsXmlCodec.readXml(xml, objectMapper);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to parse connection catalog", ex);
        }
    }

    private SnapshotRow loadSnapshot(String tenantId) {
        List<SnapshotRow> rows = jdbc.query(
                "SELECT payload, version FROM dw_connection_snapshots WHERE tenant_id = ?",
                (rs, rowNum) -> new SnapshotRow(
                        rs.getString("payload"),
                        rs.getLong("version")),
                tenantId);
        if (rows.isEmpty()) {
            return new SnapshotRow(EMPTY_XML, -1L);
        }
        SnapshotRow row = rows.get(0);
        String payload = row.payload() == null || row.payload().isBlank() ? EMPTY_XML : row.payload();
        return new SnapshotRow(payload, row.version());
    }

    private void writePayloadCas(String tenantId, String xml, long expectedVersion) {
        Timestamp now = Timestamp.from(Instant.now());
        if (expectedVersion < 0) {
            insertPayload(tenantId, xml);
            return;
        }
        long nextVersion = expectedVersion + 1;
        int updated = jdbc.update(
                "UPDATE dw_connection_snapshots SET payload = ?, version = ?, updated_at = ? "
                        + "WHERE tenant_id = ? AND version = ?",
                xml,
                nextVersion,
                now,
                tenantId,
                expectedVersion);
        if (updated == 0) {
            throw new ConnectionCatalogConflictException();
        }
    }

    private void insertPayload(String tenantId, String xml) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(
                "INSERT INTO dw_connection_snapshots (tenant_id, payload, updated_at, version) VALUES (?,?,?,?)",
                tenantId,
                xml,
                now,
                0L);
    }

    /** Import / repair path: overwrite payload and bump version without CAS. */
    private void forceWritePayload(String tenantId, String xml) {
        Timestamp now = Timestamp.from(Instant.now());
        int updated = jdbc.update(
                "UPDATE dw_connection_snapshots SET payload = ?, version = version + 1, updated_at = ? WHERE tenant_id = ?",
                xml,
                now,
                tenantId);
        if (updated == 0) {
            insertPayload(tenantId, xml);
        }
    }

    private boolean snapshotExists(String tenantId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dw_connection_snapshots WHERE tenant_id = ?",
                Integer.class,
                tenantId);
        return count != null && count > 0;
    }

    private String currentTenantId() {
        return TenantScopedConfigSupport.currentTenantId();
    }

    private ConnectionCatalogCache cacheForCurrent() {
        return caches.computeIfAbsent(currentTenantId(), ignored -> new ConnectionCatalogCache());
    }

    private Object loadLockFor(String tenantId) {
        return loadLocks.computeIfAbsent(tenantId, ignored -> new Object());
    }

    private static List<ConnectionGroupEntity> sortedGroups(ConnectionsXmlCodec.ParsedCatalog catalog) {
        return catalog.groups().stream()
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                .toList();
    }

    private static List<ConnectionEntity> sortedConnections(ConnectionsXmlCodec.ParsedCatalog catalog) {
        return catalog.connections().stream()
                .sorted(Comparator.comparingInt(ConnectionEntity::getSortOrder))
                .toList();
    }

    private record SnapshotRow(String payload, long version) {
    }
}
