package org.apache.datawise.backend.configstore.connections;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.FileConnectionStore;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProjectConnectionsSplitTest {

    @TempDir
    Path tempDir;

    @Test
    void partitionAndMergeRoundTrip() {
        ConnectionGroupEntity g1 = group("g1", "proj_a");
        ConnectionGroupEntity g2 = group("g2", "proj_b");
        ConnectionEntity c1 = connection("c1", "g1", "proj_a");
        ConnectionEntity c2 = connection("c2", "g2", "proj_b");

        var partitioned = ProjectConnectionsSplitSupport.partition(List.of(g1, g2), List.of(c1, c2));
        assertEquals(2, partitioned.connectionsByProject().size());
        assertEquals(1, partitioned.connectionsByProject().get("proj_a").size());
        assertEquals(1, partitioned.connectionsByProject().get("proj_b").size());

        var merged = ProjectConnectionsSplitSupport.merge(List.of(
                new ConnectionsXmlCodec.ParsedCatalog(
                        partitioned.groupsByProject().get("proj_a"),
                        partitioned.connectionsByProject().get("proj_a")),
                new ConnectionsXmlCodec.ParsedCatalog(
                        partitioned.groupsByProject().get("proj_b"),
                        partitioned.connectionsByProject().get("proj_b"))));
        assertEquals(2, merged.groups().size());
        assertEquals(2, merged.connections().size());
    }

    @Test
    void splitModeWritesPerProjectFiles() {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        FileConnectionStore store = new FileConnectionStore(configDirectory, new ObjectMapper(), codec, true);

        store.saveGroup(group("g-a", "proj_alpha"));
        store.saveGroup(group("g-b", "proj_beta"));
        ConnectionEntity connA = connection("c-a", "g-a", "proj_alpha");
        connA.setName("Alpha DB");
        ConnectionEntity connB = connection("c-b", "g-b", "proj_beta");
        connB.setName("Beta DB");
        store.saveConnection(connA);
        store.saveConnection(connB);

        Path unified = tempDir.resolve(TenantScopedConfigSupport.defaultTenantConnectionsPath());
        Path fileA = tempDir.resolve(ConfigPaths.tenantProjectConnections(TenantIds.DEFAULT, "proj_alpha"));
        Path fileB = tempDir.resolve(ConfigPaths.tenantProjectConnections(TenantIds.DEFAULT, "proj_beta"));

        assertFalse(Files.isRegularFile(unified));
        assertTrue(Files.isRegularFile(fileA));
        assertTrue(Files.isRegularFile(fileB));
        assertEquals(2, store.findAllConnections().size());
        assertEquals("Alpha DB", store.findConnectionById("c-a").orElseThrow().getName());
        assertEquals("Beta DB", store.findConnectionById("c-b").orElseThrow().getName());
    }

    @Test
    void ensureTenantFilesMigratesUnifiedCatalog() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);

        FileConnectionStore unifiedStore = new FileConnectionStore(configDirectory, new ObjectMapper(), codec, false);
        unifiedStore.saveGroup(group("g-a", "proj_alpha"));
        unifiedStore.saveGroup(group("g-b", "proj_beta"));
        unifiedStore.saveConnection(connection("c-a", "g-a", "proj_alpha"));
        unifiedStore.saveConnection(connection("c-b", "g-b", "proj_beta"));

        Path unified = tempDir.resolve(TenantScopedConfigSupport.defaultTenantConnectionsPath());
        assertTrue(Files.isRegularFile(unified));

        ConnectionCatalogPersistence splitPersistence = new ConnectionCatalogPersistence(
                configDirectory, new ObjectMapper(), codec, true);
        splitPersistence.ensureTenantFiles(TenantIds.DEFAULT);

        assertFalse(Files.isRegularFile(unified));
        assertTrue(Files.isRegularFile(
                unified.resolveSibling(ConfigPaths.CONNECTIONS + ConfigPaths.CONNECTIONS_MIGRATED_SUFFIX)));
        assertTrue(Files.isRegularFile(
                tempDir.resolve(ConfigPaths.tenantProjectConnections(TenantIds.DEFAULT, "proj_alpha"))));
        assertTrue(Files.isRegularFile(
                tempDir.resolve(ConfigPaths.tenantProjectConnections(TenantIds.DEFAULT, "proj_beta"))));
        assertEquals(2, new FileConnectionStore(configDirectory, new ObjectMapper(), codec, true)
                .findAllConnections().size());
    }

    private static ConnectionGroupEntity group(String id, String projectId) {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId(id);
        group.setLabel(id);
        group.setSortOrder(0);
        group.setExpanded(true);
        group.setProjectId(projectId);
        return group;
    }

    private static ConnectionEntity connection(String id, String groupId, String projectId) {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId(id);
        connection.setGroupId(groupId);
        connection.setName(id);
        connection.setDbType("mysql");
        connection.setHost("127.0.0.1");
        connection.setPort("3306");
        connection.setProjectId(projectId);
        return connection;
    }
}
