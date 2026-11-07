package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 访客会话内临时连接 catalog（进程内存，不写 connections.xml）。
 */
@Service
public class SessionEphemeralCatalogStore {

    private final ConcurrentHashMap<String, MutableCatalog> catalogs = new ConcurrentHashMap<>();

    public ConnectionsXmlCodec.ParsedCatalog getCatalog(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return emptyCatalog();
        }
        MutableCatalog catalog = catalogs.get(sessionId.trim());
        if (catalog == null) {
            return emptyCatalog();
        }
        return catalog.snapshot();
    }

    public String ensureDefaultGroupId(String sessionId) {
        MutableCatalog catalog = catalogForSession(sessionId);
        synchronized (catalog) {
            if (catalog.groups.isEmpty()) {
                ConnectionGroupEntity group = new ConnectionGroupEntity();
                group.setId(IdGenerator.shortId("guest-group-"));
                group.setLabel("\u4e34\u65f6\u5206\u7ec4");
                group.setSortOrder(0);
                group.setExpanded(true);
                catalog.groups.add(group);
            }
            return catalog.groups.stream()
                    .filter(group -> group.getParentId() == null)
                    .min(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                    .orElse(catalog.groups.get(0))
                    .getId();
        }
    }

    public Optional<ConnectionGroupEntity> findGroupById(String sessionId, String groupId) {
        MutableCatalog catalog = catalogs.get(normalizeSessionId(sessionId));
        if (catalog == null || groupId == null) {
            return Optional.empty();
        }
        synchronized (catalog) {
            return catalog.groups.stream()
                    .filter(group -> groupId.equals(group.getId()))
                    .findFirst();
        }
    }

    public Optional<ConnectionEntity> findConnectionById(String sessionId, String connectionId) {
        MutableCatalog catalog = catalogs.get(normalizeSessionId(sessionId));
        if (catalog == null || connectionId == null) {
            return Optional.empty();
        }
        synchronized (catalog) {
            return catalog.connections.stream()
                    .filter(connection -> connectionId.equals(connection.getId()))
                    .findFirst();
        }
    }

    public List<ConnectionEntity> findConnectionsByGroupId(String sessionId, String groupId) {
        MutableCatalog catalog = catalogs.get(normalizeSessionId(sessionId));
        if (catalog == null || groupId == null) {
            return List.of();
        }
        synchronized (catalog) {
            return catalog.connections.stream()
                    .filter(connection -> groupId.equals(connection.getGroupId()))
                    .sorted(Comparator.comparingInt(ConnectionEntity::getSortOrder))
                    .toList();
        }
    }

    public ConnectionGroupEntity saveGroup(String sessionId, ConnectionGroupEntity group) {
        MutableCatalog catalog = catalogForSession(sessionId);
        synchronized (catalog) {
            catalog.groups.removeIf(existing -> existing.getId().equals(group.getId()));
            catalog.groups.add(group);
            return group;
        }
    }

    public ConnectionEntity saveConnection(String sessionId, ConnectionEntity connection) {
        MutableCatalog catalog = catalogForSession(sessionId);
        synchronized (catalog) {
            catalog.connections.removeIf(existing -> existing.getId().equals(connection.getId()));
            catalog.connections.add(connection);
            return connection;
        }
    }

    public void deleteConnectionById(String sessionId, String connectionId) {
        MutableCatalog catalog = catalogs.get(normalizeSessionId(sessionId));
        if (catalog == null) {
            return;
        }
        synchronized (catalog) {
            catalog.connections.removeIf(connection -> connectionId.equals(connection.getId()));
        }
    }

    public void deleteGroupCascade(String sessionId, String groupId) {
        MutableCatalog catalog = catalogs.get(normalizeSessionId(sessionId));
        if (catalog == null) {
            return;
        }
        synchronized (catalog) {
            List<String> childGroupIds = catalog.groups.stream()
                    .filter(group -> groupId.equals(group.getParentId()))
                    .map(ConnectionGroupEntity::getId)
                    .toList();
            for (String childGroupId : childGroupIds) {
                deleteGroupCascadeLocked(catalog, childGroupId);
            }
            catalog.connections.removeIf(connection -> groupId.equals(connection.getGroupId()));
            catalog.groups.removeIf(group -> groupId.equals(group.getId()));
        }
    }

    public List<String> listConnectionIds(String sessionId) {
        MutableCatalog catalog = catalogs.get(normalizeSessionId(sessionId));
        if (catalog == null) {
            return List.of();
        }
        synchronized (catalog) {
            return catalog.connections.stream().map(ConnectionEntity::getId).toList();
        }
    }

    public void removeSession(String sessionId) {
        catalogs.remove(normalizeSessionId(sessionId));
    }

    private void deleteGroupCascadeLocked(MutableCatalog catalog, String groupId) {
        List<String> childGroupIds = catalog.groups.stream()
                .filter(group -> groupId.equals(group.getParentId()))
                .map(ConnectionGroupEntity::getId)
                .toList();
        for (String childGroupId : childGroupIds) {
            deleteGroupCascadeLocked(catalog, childGroupId);
        }
        catalog.connections.removeIf(connection -> groupId.equals(connection.getGroupId()));
        catalog.groups.removeIf(group -> groupId.equals(group.getId()));
    }

    private MutableCatalog catalogForSession(String sessionId) {
        return catalogs.computeIfAbsent(normalizeSessionId(sessionId), ignored -> new MutableCatalog());
    }

    private static String normalizeSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("sessionId is required");
        }
        return sessionId.trim();
    }

    private static ConnectionsXmlCodec.ParsedCatalog emptyCatalog() {
        return new ConnectionsXmlCodec.ParsedCatalog(List.of(), List.of());
    }

    private static final class MutableCatalog {

        private final List<ConnectionGroupEntity> groups = new ArrayList<>();
        private final List<ConnectionEntity> connections = new ArrayList<>();

        private ConnectionsXmlCodec.ParsedCatalog snapshot() {
            return new ConnectionsXmlCodec.ParsedCatalog(
                    List.copyOf(groups),
                    List.copyOf(connections));
        }
    }
}
