package org.apache.datawise.backend.service.discovery;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DiscoverySearchIndexStoreTest {

    private DiscoverySearchIndexStore store;

    @BeforeEach
    void setUp() {
        store = new DiscoverySearchIndexStore();
        UserContext.set(1L, false, "session-idx");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void rebuildAndCandidatesMatchWalkBuilder() {
        ConnectionEntity connection = connection("conn-1", "Shop");
        TreeNode database = node("db", "shop", "database");
        TreeNode orders = node("t1", "orders", "table");
        orders.setComment("customer #retail");
        TreeNode payments = node("t2", "payments", "table");
        database.setChildren(List.of(orders, payments));

        List<DiscoveryIndexedRelation> built = DiscoverySchemaIndexBuilder.build(connection, List.of(database));
        store.rebuild("conn-1", connection, List.of(database));

        DiscoverySearchIndexStore.ConnectionIndex index = store.find("conn-1").orElseThrow();
        assertEquals(built.size(), index.relations().size());
        assertEquals(2, index.candidates(List.of()).size());

        List<DiscoveryIndexedRelation> orderHits = index.candidates(List.of("orders"));
        assertEquals(1, orderHits.size());
        assertEquals("orders", orderHits.get(0).name());

        List<DiscoveryIndexedRelation> tagHits = index.candidates(List.of("retail"));
        assertEquals(1, tagHits.size());
        assertTrue(tagHits.get(0).tags().contains("retail"));
    }

    @Test
    void clearRemovesIndex() {
        ConnectionEntity connection = connection("conn-1", "Shop");
        TreeNode database = node("db", "shop", "database");
        database.setChildren(List.of(node("t1", "orders", "table")));
        store.rebuild("conn-1", connection, List.of(database));
        assertTrue(store.find("conn-1").isPresent());
        store.clear("conn-1");
        assertTrue(store.find("conn-1").isEmpty());
    }

    private static ConnectionEntity connection(String id, String name) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setName(name);
        entity.setDbType("mysql");
        return entity;
    }

    private static TreeNode node(String id, String label, String type) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType(type);
        return node;
    }
}
