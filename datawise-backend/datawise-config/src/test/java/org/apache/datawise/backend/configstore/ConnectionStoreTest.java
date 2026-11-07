package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.configstore.FileConnectionStore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectionStoreTest {

    @TempDir
    Path tempDir;

    @Test
    void saveConnectionWritesConnectionsXml() {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ConnectionStore store = new FileConnectionStore(configDirectory, new ObjectMapper(), codec);

        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("group-test");
        group.setUserId(1L);
        group.setLabel("\u6d4b\u8bd5\u7ec4");
        group.setSortOrder(0);
        group.setExpanded(true);
        store.saveGroup(group);

        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-test");
        connection.setUserId(1L);
        connection.setGroupId("group-test");
        connection.setName("Local");
        connection.setDbType("mysql");
        connection.setHost("127.0.0.1");
        connection.setPort("3306");
        store.saveConnection(connection);

        Path xml = tempDir.resolve(TenantScopedConfigSupport.defaultTenantConnectionsPath());
        assertTrue(xml.toFile().isFile());
        assertEquals("Local", store.findConnectionById("conn-test").orElseThrow().getName());
    }

    @Test
    void encryptsPasswordOnDiskAndDecryptsOnRead() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ConnectionStore store = new FileConnectionStore(configDirectory, new ObjectMapper(), codec);

        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("group-secret");
        group.setLabel("Secret");
        group.setSortOrder(0);
        group.setExpanded(true);
        store.saveGroup(group);

        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-secret");
        connection.setGroupId("group-secret");
        connection.setName("DB");
        connection.setDbType("mysql");
        connection.setPassword("plain-db-pass");
        connection.setSshPassword("plain-ssh-pass");
        store.saveConnection(connection);

        String xml = Files.readString(
                tempDir.resolve(TenantScopedConfigSupport.defaultTenantConnectionsPath()),
                StandardCharsets.UTF_8);
        assertFalse(xml.contains("plain-db-pass"));
        assertFalse(xml.contains("plain-ssh-pass"));
        assertTrue(xml.contains(SecretValueCodec.PREFIX));

        ConnectionEntity restored = store.findConnectionById("conn-secret").orElseThrow();
        assertEquals("plain-db-pass", restored.getPassword());
        assertEquals("plain-ssh-pass", restored.getSshPassword());
    }

    @Test
    void readsManualXmlEditsWithoutRestart() throws Exception {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ConnectionStore store = new FileConnectionStore(configDirectory, new ObjectMapper(), codec);

        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("group-manual");
        group.setLabel("Manual");
        group.setSortOrder(0);
        group.setExpanded(true);
        store.saveGroup(group);

        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("conn-manual");
        connection.setGroupId("group-manual");
        connection.setName("Before");
        connection.setDbType("mysql");
        store.saveConnection(connection);

        Path xml = tempDir.resolve(TenantScopedConfigSupport.defaultTenantConnectionsPath());
        String edited = Files.readString(xml, StandardCharsets.UTF_8).replace("Before", "After manual edit");
        Files.writeString(xml, edited, StandardCharsets.UTF_8);

        assertEquals("After manual edit", store.findConnectionById("conn-manual").orElseThrow().getName());
    }

    @Test
    void findAllConnectionsReturnsSharedCatalogRegardlessOfUserId() {
        SecretValueCodec codec = SecretTestSupport.testCodec();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ConnectionStore store = new FileConnectionStore(configDirectory, new ObjectMapper(), codec);

        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("group-shared");
        group.setLabel("Shared");
        group.setSortOrder(0);
        group.setExpanded(true);
        store.saveGroup(group);

        ConnectionEntity alice = new ConnectionEntity();
        alice.setId("conn-alice");
        alice.setUserId(1L);
        alice.setGroupId("group-shared");
        alice.setName("Alice DB");
        alice.setDbType("mysql");
        store.saveConnection(alice);

        ConnectionEntity bob = new ConnectionEntity();
        bob.setId("conn-bob");
        bob.setUserId(2L);
        bob.setGroupId("group-shared");
        bob.setName("Bob DB");
        bob.setDbType("mysql");
        store.saveConnection(bob);

        assertEquals(2, store.findAllConnections().size());
        assertTrue(store.findConnectionById("conn-alice").isPresent());
        assertTrue(store.findConnectionById("conn-bob").isPresent());
    }
}
