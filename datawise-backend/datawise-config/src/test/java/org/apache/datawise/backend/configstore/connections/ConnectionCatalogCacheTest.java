package org.apache.datawise.backend.configstore.connections;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectionCatalogCacheTest {

    @Test
    void putAndGet_indexesConnectionsAndGroupsById() {
        ConnectionCatalogCache cache = new ConnectionCatalogCache();
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("grp-1");
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-1");
        connection.setGroupId("grp-1");
        connection.setSortOrder(2);
        ConnectionsXmlCodec.ParsedCatalog catalog = new ConnectionsXmlCodec.ParsedCatalog(
                List.of(group),
                List.of(connection));

        ConnectionCatalogCache.Entry entry = cache.putAndGet(100L, catalog);

        assertEquals(catalog, entry.catalog());
        assertEquals(connection, entry.connectionsById().get("conn-1"));
        assertEquals(group, entry.groupsById().get("grp-1"));
        assertEquals(List.of(connection), entry.connectionsByGroupId().get("grp-1"));
        assertEquals(entry, cache.getIfFresh(100L));
        assertNull(cache.getIfFresh(101L));
    }

    @Test
    void invalidate_clearsCachedEntry() {
        ConnectionCatalogCache cache = new ConnectionCatalogCache();
        cache.putAndGet(1L, new ConnectionsXmlCodec.ParsedCatalog(List.of(), List.of()));
        cache.invalidate();
        assertNull(cache.getIfFresh(1L));
    }

    @Test
    void buildEntry_sortsConnectionsWithinGroup() {
        ConnectionEntity first = new ConnectionEntity();
        first.setId("conn-a");
        first.setGroupId("grp-1");
        first.setSortOrder(5);
        ConnectionEntity second = new ConnectionEntity();
        second.setId("conn-b");
        second.setGroupId("grp-1");
        second.setSortOrder(1);

        ConnectionCatalogCache.Entry entry = ConnectionCatalogCache.buildEntry(
                1L,
                new ConnectionsXmlCodec.ParsedCatalog(List.of(), List.of(first, second)));

        assertEquals(
                List.of("conn-b", "conn-a"),
                entry.connectionsByGroupId().get("grp-1").stream().map(ConnectionEntity::getId).toList());
        assertTrue(entry.connectionsById().containsKey("conn-a"));
    }
}
