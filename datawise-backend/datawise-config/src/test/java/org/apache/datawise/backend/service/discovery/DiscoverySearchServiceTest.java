package org.apache.datawise.backend.service.discovery;

import org.apache.datawise.backend.configstore.SchemaCacheStore;
import org.apache.datawise.backend.configstore.SemanticMetricStore;
import org.apache.datawise.backend.domain.DiscoveryColumnPeekDto;
import org.apache.datawise.backend.domain.DiscoveryHitDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.SemanticMetricEntry;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DiscoverySearchServiceTest {

    private ConnectionVisibilityService visibility;
    private SchemaCacheStore schemaCacheStore;
    private SemanticMetricStore metricStore;
    private DiscoverySearchService service;

    @BeforeEach
    void setUp() {
        visibility = mock(ConnectionVisibilityService.class);
        schemaCacheStore = mock(SchemaCacheStore.class);
        metricStore = mock(SemanticMetricStore.class);
        service = new DiscoverySearchService(
                visibility,
                schemaCacheStore,
                new DiscoverySearchIndexStore(),
                metricStore);
    }

    @Test
    void searchMatchesCachedTablesAndMetricsByOwner() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-1");
        connection.setName("Shop DB");
        connection.setDbType("mysql");

        when(visibility.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(List.of(), List.of(connection)));

        TreeNode database = node("db-shop", "shop", "database");
        TreeNode table = node("tbl-orders", "orders", "table");
        table.setComment("customer orders");
        database.setChildren(List.of(table));
        when(schemaCacheStore.load("conn-1")).thenReturn(List.of(database));

        SemanticMetricEntry metric = new SemanticMetricEntry();
        metric.setId("metric-gmv");
        metric.setConnectionId("conn-1");
        metric.setDatabase("shop");
        metric.setName("gmv");
        metric.setDescription("gross merchandise value");
        metric.setOwner("alice");
        metric.setRelatedTables(List.of("orders", "shop.payments"));
        when(metricStore.listAll()).thenReturn(List.of(metric));

        List<DiscoveryHitDto> byTable = service.search("orders", 20).hits();
        assertEquals(1, byTable.size());
        assertEquals("table", byTable.get(0).kind());
        assertEquals("orders", byTable.get(0).name());
        assertTrue(byTable.get(0).relatedTables().isEmpty());

        List<DiscoveryHitDto> byOwner = service.search("alice", 20).hits();
        assertEquals(1, byOwner.size());
        assertEquals("metric", byOwner.get(0).kind());
        assertEquals("alice", byOwner.get(0).owner());
        assertTrue(byOwner.get(0).subtitle() != null && byOwner.get(0).subtitle().contains("alice"));
        assertEquals(List.of("orders", "shop.payments"), byOwner.get(0).relatedTables());
    }

    @Test
    void emptyQueryBrowsesCachedCatalog() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-1");
        connection.setName("Shop DB");
        connection.setDbType("mysql");

        when(visibility.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(List.of(), List.of(connection)));

        TreeNode database = node("db-shop", "shop", "database");
        TreeNode table = node("tbl-orders", "orders", "table");
        TreeNode view = node("vw-customers", "customers_v", "view");
        database.setChildren(List.of(table, view));
        when(schemaCacheStore.load("conn-1")).thenReturn(List.of(database));

        SemanticMetricEntry metric = new SemanticMetricEntry();
        metric.setId("metric-gmv");
        metric.setConnectionId("conn-1");
        metric.setDatabase("shop");
        metric.setName("gmv");
        metric.setOwner("alice");
        when(metricStore.listAll()).thenReturn(List.of(metric));

        List<DiscoveryHitDto> browsed = service.search("  ", 20).hits();
        assertEquals(3, browsed.size());
        assertEquals("customers_v", browsed.get(0).name());
        assertEquals("gmv", browsed.get(1).name());
        assertEquals("orders", browsed.get(2).name());
    }

    @Test
    void searchSupportsOffsetPagination() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-1");
        connection.setName("Shop DB");
        connection.setDbType("mysql");

        when(visibility.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(List.of(), List.of(connection)));

        TreeNode database = node("db-shop", "shop", "database");
        TreeNode table = node("tbl-orders", "orders", "table");
        TreeNode view = node("vw-customers", "customers_v", "view");
        database.setChildren(List.of(table, view));
        when(schemaCacheStore.load("conn-1")).thenReturn(List.of(database));

        SemanticMetricEntry metric = new SemanticMetricEntry();
        metric.setId("metric-gmv");
        metric.setConnectionId("conn-1");
        metric.setDatabase("shop");
        metric.setName("gmv");
        when(metricStore.listAll()).thenReturn(List.of(metric));

        var first = service.search("", 2, 0);
        assertEquals(3, first.total());
        assertEquals(2, first.hits().size());
        assertEquals(0, first.offset());
        assertEquals(2, first.limit());
        assertTrue(first.hasMore());
        assertEquals("customers_v", first.hits().get(0).name());
        assertEquals("gmv", first.hits().get(1).name());

        var second = service.search("", 2, 2);
        assertEquals(3, second.total());
        assertEquals(1, second.hits().size());
        assertEquals(2, second.offset());
        assertFalse(second.hasMore());
        assertEquals("orders", second.hits().get(0).name());
    }

    @Test
    void searchReturnsTagsAndServerFacetFilters() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-1");
        connection.setName("Shop DB");
        connection.setDbType("mysql");

        when(visibility.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(List.of(), List.of(connection)));

        TreeNode database = node("db-shop", "shop", "database");
        TreeNode table = node("tbl-orders", "orders", "table");
        table.setComment("customer orders #pii #finance");
        TreeNode view = node("vw-customers", "customers_v", "view");
        view.setComment("public view");
        database.setChildren(List.of(table, view));
        when(schemaCacheStore.load("conn-1")).thenReturn(List.of(database));

        SemanticMetricEntry metric = new SemanticMetricEntry();
        metric.setId("metric-gmv");
        metric.setConnectionId("conn-1");
        metric.setDatabase("shop");
        metric.setName("gmv");
        metric.setOwner("alice");
        metric.setTags(List.of("KPI", "finance"));
        when(metricStore.listAll()).thenReturn(List.of(metric));

        var browsed = service.search("", 20, 0);
        assertEquals(3, browsed.total());
        assertFalse(browsed.facets().tags().isEmpty());
        assertTrue(browsed.facets().tags().stream().anyMatch(item -> "finance".equals(item.value())));

        DiscoveryHitDto orders = browsed.hits().stream()
                .filter(hit -> "orders".equals(hit.name()))
                .findFirst()
                .orElseThrow();
        assertEquals(List.of("pii", "finance"), orders.tags());

        DiscoveryHitDto gmv = browsed.hits().stream()
                .filter(hit -> "gmv".equals(hit.name()))
                .findFirst()
                .orElseThrow();
        assertEquals(List.of("kpi", "finance"), gmv.tags());

        var byTag = service.search("", 20, 0, null, null, null, List.of("pii"));
        assertEquals(1, byTag.total());
        assertEquals("orders", byTag.hits().get(0).name());
        assertTrue(byTag.hasMore() == false);

        var byKind = service.search("", 20, 0, List.of("metric"), null, null, null);
        assertEquals(1, byKind.total());
        assertEquals("gmv", byKind.hits().get(0).name());
        assertTrue(byKind.facets().kinds().stream().anyMatch(item -> "table".equals(item.value()) && item.count() == 1));

        var byOwner = service.search("", 20, 0, null, null, List.of("alice"), null);
        assertEquals(1, byOwner.total());
        assertEquals("gmv", byOwner.hits().get(0).name());

        assertEquals(1, service.search("pii", 20).hits().size());
        assertEquals("orders", service.search("pii", 20).hits().get(0).name());
    }

    @Test
    void searchIncludesColumnPeekFromSchemaCache() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-1");
        connection.setName("Shop DB");
        connection.setDbType("mysql");

        when(visibility.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(List.of(), List.of(connection)));

        TreeNode database = node("db-shop", "shop", "database");
        TreeNode table = node("tbl-orders", "orders", "table");
        TreeNode columnsFolder = node("cols-orders", "columns", "columns");
        TreeNode idCol = node("col-id", "id", "primary_key");
        idCol.setMeta("bigint · pk");
        TreeNode nameCol = node("col-name", "customer_name", "column");
        nameCol.setMeta("varchar");
        columnsFolder.setChildren(List.of(idCol, nameCol));
        table.setChildren(List.of(columnsFolder));
        database.setChildren(List.of(table));
        when(schemaCacheStore.load("conn-1")).thenReturn(List.of(database));
        when(metricStore.listAll()).thenReturn(List.of());

        DiscoveryHitDto hit = service.search("orders", 20).hits().get(0);
        assertEquals("table", hit.kind());
        assertEquals(List.of(
                new DiscoveryColumnPeekDto("id", "bigint"),
                new DiscoveryColumnPeekDto("customer_name", "varchar")), hit.columns());
    }

    @Test
    void extractColumnPeekReturnsEmptyWhenColumnsNotHydrated() {
        TreeNode table = node("tbl-orders", "orders", "table");
        TreeNode columnsFolder = node("cols-orders", "columns", "columns");
        columnsFolder.setChildren(List.of());
        table.setChildren(List.of(columnsFolder));

        assertTrue(DiscoverySearchService.extractColumnPeek(table).isEmpty());
    }

    @Test
    void indexedSearchMatchesColdWalkResults() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-1");
        connection.setName("Shop DB");
        connection.setDbType("mysql");

        when(visibility.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(List.of(), List.of(connection)));

        TreeNode database = node("db-shop", "shop", "database");
        TreeNode table = node("tbl-orders", "orders", "table");
        table.setComment("fulfillment #ops");
        TreeNode view = node("vw-customers", "customers_v", "view");
        database.setChildren(List.of(table, view));
        when(schemaCacheStore.load("conn-1")).thenReturn(List.of(database));
        when(metricStore.listAll()).thenReturn(List.of());

        DiscoverySearchIndexStore indexStore = new DiscoverySearchIndexStore();
        DiscoverySearchService cold = new DiscoverySearchService(
                visibility, schemaCacheStore, indexStore, metricStore);
        List<DiscoveryHitDto> coldHits = cold.search("orders", 20).hits();

        // Warm index explicitly, then search again without loading schema cache again.
        indexStore.rebuild("conn-1", connection, List.of(database));
        when(schemaCacheStore.load("conn-1")).thenReturn(List.of());
        List<DiscoveryHitDto> warmHits = cold.search("orders", 20).hits();

        assertEquals(1, coldHits.size());
        assertEquals(1, warmHits.size());
        assertEquals(coldHits.get(0).name(), warmHits.get(0).name());
        assertEquals(coldHits.get(0).qualifiedLabel(), warmHits.get(0).qualifiedLabel());
        assertEquals(coldHits.get(0).score(), warmHits.get(0).score());
        assertEquals(coldHits.get(0).tags(), warmHits.get(0).tags());
    }

    private static TreeNode node(String id, String label, String type) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType(type);
        return node;
    }
}
