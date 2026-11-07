package org.apache.datawise.backend.configstore.connections;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * connections.xml 解密 catalog 的 mtime 缓存，附带按 id / groupId 的索引。
 */
public final class ConnectionCatalogCache {

    private volatile Entry entry;

    public Entry getIfFresh(long lastModified) {
        Entry cached = entry;
        if (cached != null && cached.lastModified == lastModified) {
            return cached;
        }
        return null;
    }

    public Entry putAndGet(long lastModified, ConnectionsXmlCodec.ParsedCatalog catalog) {
        Entry built = buildEntry(lastModified, catalog);
        entry = built;
        return built;
    }

    public void put(long lastModified, ConnectionsXmlCodec.ParsedCatalog catalog) {
        putAndGet(lastModified, catalog);
    }

    public void invalidate() {
        entry = null;
    }

    public static Entry buildEntry(long lastModified, ConnectionsXmlCodec.ParsedCatalog catalog) {
        Map<String, ConnectionEntity> connectionsById = new HashMap<>();
        for (ConnectionEntity connection : catalog.connections()) {
            connectionsById.put(connection.getId(), connection);
        }

        Map<String, ConnectionGroupEntity> groupsById = new HashMap<>();
        for (ConnectionGroupEntity group : catalog.groups()) {
            groupsById.put(group.getId(), group);
        }

        Map<String, List<ConnectionEntity>> connectionsByGroupId = new HashMap<>();
        for (ConnectionEntity connection : catalog.connections()) {
            connectionsByGroupId
                    .computeIfAbsent(connection.getGroupId(), ignored -> new ArrayList<>())
                    .add(connection);
        }
        Map<String, List<ConnectionEntity>> sortedByGroupId = new HashMap<>();
        for (Map.Entry<String, List<ConnectionEntity>> groupEntry : connectionsByGroupId.entrySet()) {
            List<ConnectionEntity> sorted = new ArrayList<>(groupEntry.getValue());
            sorted.sort(Comparator.comparingInt(ConnectionEntity::getSortOrder));
            sortedByGroupId.put(groupEntry.getKey(), List.copyOf(sorted));
        }

        return new Entry(
                lastModified,
                catalog,
                Map.copyOf(connectionsById),
                Map.copyOf(groupsById),
                Map.copyOf(sortedByGroupId));
    }

    public record Entry(
            long lastModified,
            ConnectionsXmlCodec.ParsedCatalog catalog,
            Map<String, ConnectionEntity> connectionsById,
            Map<String, ConnectionGroupEntity> groupsById,
            Map<String, List<ConnectionEntity>> connectionsByGroupId) {
    }
}
