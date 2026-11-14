package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.apache.datawise.backend.configstore.connections.ConnectionCatalogPersistence;
import org.apache.datawise.backend.configstore.connections.ProjectConnectionsProperties;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * 连接与分组门面：按当前租户读写 {@code config/tenants/{id}/connections.xml}。
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileConnectionStore implements ConnectionStore {

    private final ConnectionCatalogPersistence persistence;

    @Autowired
    public FileConnectionStore(
                               ConfigDirectoryService configDirectory,
                               ObjectMapper objectMapper,
                               SecretValueCodec secretValueCodec,
                               ProjectConnectionsProperties projectConnectionsProperties) {
        this(new ConnectionCatalogPersistence(
                configDirectory,
                objectMapper,
                secretValueCodec,
                projectConnectionsProperties != null && projectConnectionsProperties.isSplitConnections()));
    }

    /** Tests / callers without Spring properties (split disabled). */
    public FileConnectionStore(
                               ConfigDirectoryService configDirectory,
                               ObjectMapper objectMapper,
                               SecretValueCodec secretValueCodec) {
        this(configDirectory, objectMapper, secretValueCodec, false);
    }

    public FileConnectionStore(
                               ConfigDirectoryService configDirectory,
                               ObjectMapper objectMapper,
                               SecretValueCodec secretValueCodec,
                               boolean splitConnections) {
        this(new ConnectionCatalogPersistence(
                configDirectory,
                objectMapper,
                secretValueCodec,
                splitConnections));
    }

    FileConnectionStore(ConnectionCatalogPersistence persistence) {
        this.persistence = persistence;
    }

    @Override
    public void ensureTenantFiles(String tenantId) {
        persistence.ensureTenantFiles(tenantId);
    }

    @Override
    public Path connectionsFilePath() {
        return persistence.connectionsFilePath();
    }

    @Override
    public String readConnectionsXml() throws Exception {
        return persistence.readConnectionsXml();
    }

    @Override
    public List<ConnectionGroupEntity> findAllGroups() {
        return sortedGroups(persistence.loadCachedCatalog());
    }

    @Override
    public List<ConnectionEntity> findAllConnections() {
        return sortedConnections(persistence.loadDecryptedCatalog());
    }

    @Override
    public List<ConnectionGroupEntity> findRootGroups() {
        return persistence.loadCachedCatalog().groups().stream()
                .filter(group -> group.getParentId() == null)
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                .toList();
    }

    @Override
    public List<ConnectionGroupEntity> findChildGroups(String parentId) {
        return persistence.loadCachedCatalog().groups().stream()
                .filter(group -> parentId.equals(group.getParentId()))
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                .toList();
    }

    @Override
    public synchronized void replaceAll(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
        persistence.replaceAll(groups, connections);
    }

    @Override
    public synchronized void importConnectionsXml(String xml) throws IOException {
        persistence.importConnectionsXml(xml);
    }

    @Override
    public Optional<ConnectionGroupEntity> findGroupById(String groupId) {
        return persistence.findGroupById(groupId);
    }

    @Override
    public synchronized ConnectionGroupEntity saveGroup(ConnectionGroupEntity group) {
        return persistence.upsertGroup(group);
    }

    @Override
    public synchronized void deleteGroupById(String groupId) {
        persistence.removeGroup(groupId);
    }

    @Override
    public Optional<ConnectionEntity> findConnectionById(String connectionId) {
        return persistence.findConnectionById(connectionId);
    }

    @Override
    public List<ConnectionEntity> findConnectionsByGroupId(String groupId) {
        return persistence.findConnectionsByGroupId(groupId);
    }

    @Override
    public synchronized ConnectionEntity saveConnection(ConnectionEntity connection) {
        return persistence.upsertConnection(connection);
    }

    @Override
    public synchronized void deleteConnectionById(String connectionId) {
        persistence.removeConnection(connectionId);
    }

    @Override
    public synchronized int migratePlaintextSecretsIfNeeded() {
        return persistence.migratePlaintextSecretsIfNeeded();
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
}
