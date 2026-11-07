package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

import org.apache.datawise.backend.common.ExplorerConnectionException;

import org.apache.datawise.backend.config.ExplorerSchemaProperties;
import org.apache.datawise.backend.configstore.ConnectionStore;

import org.apache.datawise.backend.connector.catalog.SchemaSession;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;

import org.apache.datawise.backend.domain.TreeNode;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;

import org.apache.datawise.backend.schema.GenericSchemaDialect;

import org.apache.datawise.backend.schema.SchemaDialectRegistry;

import org.apache.datawise.backend.service.ConnectionVisibilityService;

import org.apache.datawise.backend.service.FeaturePermissionAccess;

import org.apache.datawise.backend.database.explorer.ExplorerTreeBuilder;

import org.junit.jupiter.api.BeforeEach;

import org.junit.jupiter.api.Test;

import org.junit.jupiter.api.extension.ExtendWith;

import org.mockito.Mock;

import org.mockito.junit.jupiter.MockitoExtension;



import java.util.List;

import java.util.Optional;



import static org.junit.jupiter.api.Assertions.assertEquals;

import static org.junit.jupiter.api.Assertions.assertThrows;

import static org.junit.jupiter.api.Assertions.assertTrue;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;

import static org.mockito.ArgumentMatchers.anyLong;

import static org.mockito.ArgumentMatchers.eq;

import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;



@ExtendWith(MockitoExtension.class)

class ExplorerSchemaServiceTest {



    @Mock

    private ConnectionExecutionContext connectionContext;

    @Mock

    private ConnectionStore connectionStore;

    @Mock

    private ExplorerTreeBuilder treeBuilder;

    @Mock

    private ConnectorFacade connectorFacade;

    @Mock

    private ConnectorCatalogAccess catalogAccess;

    @Mock

    private ExplorerNodeResolver nodeResolver;

    @Mock

    private ExplorerWorkspaceSync workspaceSync;

    @Mock
    private ExplorerViewModelSync viewModelSync;

    @Mock

    private ExplorerSchemaSessionPool schemaSessionPool;

    @Mock
    private SchemaDialectRegistry dialectRegistry;

    @Mock
    private ExplorerSchemaCacheHydrator cacheHydrator;

    @Mock
    private ConnectionVisibilityService connectionVisibilityService;

    @Mock
    private SchemaSession schemaSession;

    @Mock
    private FeaturePermissionAccess featurePermissionAccess;

    private final ExplorerSchemaProperties schemaProperties = new ExplorerSchemaProperties();



    private ExplorerSchemaService service;



    @BeforeEach

    void setUp() {

        service = new ExplorerSchemaService(

                connectionContext,

                connectionStore,

                treeBuilder,

                connectorFacade,

                nodeResolver,

                workspaceSync,

                viewModelSync,

                schemaSessionPool,

                dialectRegistry,

                cacheHydrator,

                connectionVisibilityService,

                schemaProperties,

                featurePermissionAccess

        );

        lenient().when(featurePermissionAccess.filterCatalogFolderChildren(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        lenient().when(connectorFacade.catalog()).thenReturn(catalogAccess);

        lenient().when(dialectRegistry.resolve(any())).thenReturn(new GenericSchemaDialect());

        lenient().when(treeBuilder.schemaCacheVersion(any())).thenReturn(0L);

    }

    @Test
    void fetchTree_doesNotPrewarmJdbcPools() {
        ConnectionGroupEntity expanded = group("group-open", true);
        ConnectionEntity warm = connectionEntity("conn-warm", "mysql");
        warm.setGroupId(expanded.getId());
        List<ConnectionGroupEntity> groups = List.of(expanded);
        List<ConnectionEntity> connections = List.of(warm);
        List<TreeNode> tree = List.of(treeNode("group-open", "group", "Default"));

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionVisibilityService.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(groups, connections));
        when(treeBuilder.buildGroups(groups)).thenReturn(tree);

        assertEquals(tree, service.fetchTree(false));
        verify(treeBuilder).buildGroups(groups);
    }

    @Test
    void loadChildren_connectionRoot_returnsCachedWithoutLiveLoad() throws Exception {
        String connectionId = "conn-cache";
        ConnectionEntity entity = connectionEntity(connectionId, "mysql");
        TreeNode databaseNode = treeNode("db-" + connectionId, "database", "shop");

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(treeBuilder.loadSchemaChildren(eq(connectionId), anyLong())).thenReturn(List.of(databaseNode));

        List<TreeNode> children = service.loadChildren(connectionId, connectionId, null, false);

        assertEquals(1, children.size());
        verify(schemaSessionPool, never()).withSession(eq(entity), any());
        verify(catalogAccess, never()).loadConnectionRoot(entity, null);
    }

    @Test
    void loadChildren_connectionRoot_refreshUsesSchemaSessionPool() throws Exception {
        String connectionId = "conn-live";
        ConnectionEntity entity = connectionEntity(connectionId, "mysql");
        TreeNode databaseNode = treeNode("db-" + connectionId, "database", "shop");

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(catalogAccess.supportsSchemaTree(entity)).thenReturn(true);
        when(schemaSessionPool.withSession(eq(entity), any())).thenAnswer(invocation -> {
            ExplorerSchemaSessionPool.SessionCallback<?> callback = invocation.getArgument(1);
            when(schemaSession.introspectConnection()).thenReturn(List.of(databaseNode));
            return callback.apply(schemaSession);
        });

        List<TreeNode> children = service.loadChildren(connectionId, connectionId, null, true);

        assertEquals(1, children.size());
        verify(schemaSessionPool).withSession(eq(entity), any());
        verify(schemaSession).introspectConnection();
    }

    @Test

    void loadChildren_whenCatalogFails_wrapsExplorerConnectionException() throws Exception {

        ConnectionEntity entity = connectionEntity("conn-1", "mysql");

        when(connectionContext.requireUserId()).thenReturn(1L);

        when(connectionContext.requireAvailableConnection(1L, "conn-1", ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))

                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));

        when(catalogAccess.supportsSchemaTree(entity)).thenReturn(true);

        TreeNode databaseNode = treeNode("node-1", "database", "shop");

        when(treeBuilder.loadSchemaChildren("conn-1")).thenReturn(List.of(databaseNode));

        when(treeBuilder.findNodeById(any(), eq("node-1"))).thenReturn(databaseNode);

        when(schemaSessionPool.withSession(eq(entity), any())).thenAnswer(invocation -> {
            ExplorerSchemaSessionPool.SessionCallback<?> callback = invocation.getArgument(1);
            return callback.apply(schemaSession);
        });

        when(nodeResolver.resolveChildren(eq(schemaSession), any(), eq(databaseNode), any(), any()))

                .thenThrow(new RuntimeException("communications link failure"));



        ExplorerConnectionException ex = assertThrows(

                ExplorerConnectionException.class,

                () -> service.loadChildren("conn-1", "node-1", null, false)

        );

        assertEquals("EXPLORER_SCHEMA_LOAD_FAILED", ex.getErrorCode());

        verify(schemaSessionPool).withSession(eq(entity), any());

    }



    @Test

    void loadChildren_whenNodeMissing_usesStableErrorCode() throws Exception {

        ConnectionEntity entity = connectionEntity("conn-1", "mysql");

        when(connectionContext.requireUserId()).thenReturn(1L);

        when(connectionContext.requireAvailableConnection(1L, "conn-1", ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))

                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));

        when(catalogAccess.supportsSchemaTree(entity)).thenReturn(true);

        when(treeBuilder.loadSchemaChildren("conn-1")).thenReturn(List.of());

        when(treeBuilder.findNodeById(any(), eq("missing"))).thenReturn(null);

        lenient().doNothing().when(cacheHydrator)
                .ensureAncestorsLoaded(eq("conn-1"), eq("missing"), any(), any());

        when(schemaSessionPool.withSession(eq(entity), any())).thenAnswer(invocation -> {
            ExplorerSchemaSessionPool.SessionCallback<?> callback = invocation.getArgument(1);
            when(schemaSession.introspectConnection()).thenReturn(List.of());
            return callback.apply(schemaSession);
        });

        ExplorerConnectionException ex = assertThrows(

                ExplorerConnectionException.class,

                () -> service.loadChildren("conn-1", "missing", null, false)

        );

        assertEquals("EXPLORER_NODE_NOT_FOUND", ex.getErrorCode());
        verify(schemaSessionPool).invalidate("conn-1");
        verify(schemaSession).introspectConnection();

    }

    @Test
    void loadChildren_whenCacheMiss_rebuildsConnectionRootThenResolves() throws Exception {
        String connectionId = "conn-6d521e9174f5";
        String dbNodeId = "db-" + connectionId + "-sdi_server2";
        ConnectionEntity entity = connectionEntity(connectionId, "mysql");
        TreeNode databaseNode = treeNode(dbNodeId, "database", "sdi_server2");
        TreeNode tablesFolder = treeNode("folder-tables-" + connectionId + "-sdi_server2", "folder", "tables");

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(catalogAccess.supportsSchemaTree(entity)).thenReturn(true);
        when(treeBuilder.loadSchemaChildren(connectionId)).thenReturn(List.of());
        when(treeBuilder.findNodeById(any(), eq(dbNodeId)))
                .thenReturn(null)
                .thenReturn(null)
                .thenReturn(databaseNode);
        lenient().doNothing().when(cacheHydrator)
                .ensureAncestorsLoaded(eq(connectionId), eq(dbNodeId), any(), any());
        when(schemaSession.introspectConnection()).thenReturn(List.of(databaseNode));
        when(schemaSessionPool.withSession(eq(entity), any())).thenAnswer(invocation -> {
            ExplorerSchemaSessionPool.SessionCallback<?> callback = invocation.getArgument(1);
            return callback.apply(schemaSession);
        });
        when(nodeResolver.resolveChildren(eq(schemaSession), any(), eq(databaseNode), any(), any()))
                .thenReturn(List.of(tablesFolder));

        List<TreeNode> children = service.loadChildren(connectionId, dbNodeId, null, true);

        assertEquals(1, children.size());
        assertEquals(tablesFolder.getId(), children.get(0).getId());
        verify(schemaSessionPool, atLeastOnce()).invalidate(connectionId);
        verify(schemaSession).introspectConnection();
        verify(treeBuilder, atLeastOnce()).saveSchemaChildren(eq(connectionId), anyList());
    }

    @Test
    void loadChildren_hydratesMissingAncestorsBeforeResolve() throws Exception {
        String connectionId = "new-1782296190515";
        ConnectionEntity entity = connectionEntity(connectionId, "trino");
        String schemaNodeId = "schema-" + connectionId + "-hive-a003";
        TreeNode hive = treeNode("db-" + connectionId + "-hive", "database", "hive");
        TreeNode schema = treeNode(schemaNodeId, "schema", "a003");

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(catalogAccess.supportsSchemaTree(entity)).thenReturn(true);
        when(treeBuilder.loadSchemaChildren(connectionId)).thenReturn(new java.util.ArrayList<>(List.of(hive)));
        when(treeBuilder.findNodeById(any(), eq(schemaNodeId)))
                .thenReturn(null)
                .thenReturn(schema);
        when(schemaSessionPool.withSession(eq(entity), any())).thenAnswer(invocation -> {
            ExplorerSchemaSessionPool.SessionCallback<?> callback = invocation.getArgument(1);
            return callback.apply(schemaSession);
        });
        when(nodeResolver.resolveChildren(eq(schemaSession), any(), eq(schema), any(), any()))
                .thenReturn(List.of(treeNode("folder-tables-" + connectionId + "-hive-a003", "folder", "tables")));

        doNothing().when(cacheHydrator)
                .ensureAncestorsLoaded(eq(connectionId), eq(schemaNodeId), any(), any());

        List<TreeNode> children = service.loadChildren(connectionId, schemaNodeId, null, false);

        assertEquals(1, children.size());
        verify(cacheHydrator).ensureAncestorsLoaded(eq(connectionId), eq(schemaNodeId), any(), any());
    }

    @Test
    void resolveCachedLoadChildren_returnsConnectionRootWithoutSession() throws Exception {
        String connectionId = "conn-cache";
        ConnectionEntity entity = connectionEntity(connectionId, "mysql");
        TreeNode databaseNode = treeNode("db-" + connectionId, "database", "shop");

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(treeBuilder.loadSchemaChildren(eq(connectionId), anyLong())).thenReturn(List.of(databaseNode));
        when(treeBuilder.schemaCacheVersion(connectionId)).thenReturn(1L);

        Optional<ExplorerTreeLoadResult> cached = service.resolveCachedLoadChildren(
                connectionId,
                connectionId,
                ExplorerLoadOptions.of(null, false)
        );

        assertTrue(cached.isPresent());
        assertEquals(1, cached.get().tree().size());
        verify(schemaSessionPool, never()).withSession(eq(entity), any());
    }

    @Test
    void resolveCachedLoadChildren_skipsWhenRefreshRequested() {
        Optional<ExplorerTreeLoadResult> cached = service.resolveCachedLoadChildren(
                "conn-1",
                "conn-1",
                ExplorerLoadOptions.of(null, true)
        );

        assertTrue(cached.isEmpty());
    }

    @Test
    void resolveCachedLoadChildren_returnsEmptyWorkspacesFolderWhenMarkedLoaded() {
        String connectionId = "conn-1";
        ConnectionEntity entity = connectionEntity(connectionId, "mysql");
        TreeNode workspacesFolder = treeNode("folder-ws", "folder", "workspaces");
        ExplorerTreeMarkers.markFolderLoaded(workspacesFolder, "workspaces");
        workspacesFolder.setChildren(List.of());

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(catalogAccess.supportsSchemaTree(entity)).thenReturn(true);
        when(treeBuilder.loadSchemaChildren(connectionId)).thenReturn(List.of(treeNode("db-1", "database", "shop", List.of(workspacesFolder))));
        when(treeBuilder.findNodeById(any(), eq("folder-ws"))).thenReturn(workspacesFolder);
        when(treeBuilder.schemaCacheVersion(connectionId)).thenReturn(2L);

        Optional<ExplorerTreeLoadResult> cached = service.resolveCachedLoadChildren(
                connectionId,
                "folder-ws",
                ExplorerLoadOptions.of(null, false)
        );

        assertTrue(cached.isPresent());
        assertEquals(0, cached.get().tree().size());
    }

    @Test
    void resolveCachedLoadChildren_returnsEmptyTablesFolderWhenMarkedLoaded() throws Exception {
        String connectionId = "conn-1";
        ConnectionEntity entity = connectionEntity(connectionId, "mysql");
        TreeNode tablesFolder = treeNode("folder-tables", "folder", "tables");
        ExplorerTreeMarkers.markTablesFolderLoaded(tablesFolder);
        tablesFolder.setChildren(List.of());

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(catalogAccess.supportsSchemaTree(entity)).thenReturn(true);
        when(treeBuilder.loadSchemaChildren(connectionId)).thenReturn(List.of(treeNode("db-1", "database", "shop", List.of(tablesFolder))));
        when(treeBuilder.findNodeById(any(), eq("folder-tables"))).thenReturn(tablesFolder);
        when(treeBuilder.schemaCacheVersion(connectionId)).thenReturn(2L);

        Optional<ExplorerTreeLoadResult> cached = service.resolveCachedLoadChildren(
                connectionId,
                "folder-tables",
                ExplorerLoadOptions.of(null, false)
        );

        assertTrue(cached.isPresent());
        assertEquals(0, cached.get().tree().size());
        verify(schemaSessionPool, never()).withSession(eq(entity), any());
    }

    @Test
    void resolveCachedLoadChildren_returnsLegacyTablesFolderWithChildrenButNoMarker() {
        String connectionId = "conn-1";
        ConnectionEntity entity = connectionEntity(connectionId, "mysql");
        TreeNode table = treeNode("table-1", "table", "users");
        TreeNode tablesFolder = treeNode("folder-tables", "folder", "tables", List.of(table));

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(catalogAccess.supportsSchemaTree(entity)).thenReturn(true);
        when(treeBuilder.loadSchemaChildren(connectionId)).thenReturn(List.of(treeNode("db-1", "database", "shop", List.of(tablesFolder))));
        when(treeBuilder.findNodeById(any(), eq("folder-tables"))).thenReturn(tablesFolder);
        when(treeBuilder.schemaCacheVersion(connectionId)).thenReturn(2L);

        Optional<ExplorerTreeLoadResult> cached = service.resolveCachedLoadChildren(
                connectionId,
                "folder-tables",
                ExplorerLoadOptions.of(null, false)
        );

        assertTrue(cached.isPresent());
        assertEquals(1, cached.get().tree().size());
    }

    @Test
    void loadChildrenWithCaching_shortCircuitsWhenEtagMatchesCache() throws Exception {
        String connectionId = "conn-cache";
        ConnectionEntity entity = connectionEntity(connectionId, "mysql");
        TreeNode databaseNode = treeNode("db-" + connectionId, "database", "shop");

        when(connectionContext.requireUserId()).thenReturn(1L);
        when(connectionContext.requireAvailableConnection(1L, connectionId, ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(treeBuilder.loadSchemaChildren(eq(connectionId), anyLong())).thenReturn(List.of(databaseNode));
        when(treeBuilder.schemaCacheVersion(connectionId)).thenReturn(1L);

        ExplorerTreeLoadResult live = service.resolveCachedLoadChildren(
                connectionId,
                connectionId,
                ExplorerLoadOptions.of(null, false)
        ).orElseThrow();
        ExplorerChildLoadOutcome outcome = service.loadChildrenWithCaching(
                connectionId,
                connectionId,
                ExplorerLoadOptions.of(null, false),
                live.etag()
        );

        assertTrue(outcome.notModified());
        assertTrue(outcome.shortCircuited());
        verify(schemaSessionPool, never()).withSession(eq(entity), any());
    }

    private static ConnectionGroupEntity group(String id, boolean expanded) {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId(id);
        group.setLabel(id);
        group.setExpanded(expanded);
        return group;
    }

    private static ConnectionEntity connectionEntity(String id, String dbType) {
        ConnectionEntity entity = new ConnectionEntity();

        entity.setId(id);

        entity.setDbType(dbType);

        entity.setHost("127.0.0.1");

        entity.setPort("3306");

        return entity;

    }



    private static TreeNode treeNode(String id, String type, String label) {

        TreeNode node = new TreeNode();

        node.setId(id);

        node.setType(type);

        node.setLabel(label);

        return node;

    }

    private static TreeNode treeNode(String id, String type, String label, List<TreeNode> children) {
        TreeNode node = treeNode(id, type, label);
        node.setChildren(children);
        return node;
    }

}
