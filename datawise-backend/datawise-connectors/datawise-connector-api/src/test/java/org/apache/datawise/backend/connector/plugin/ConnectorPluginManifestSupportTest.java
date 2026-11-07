package org.apache.datawise.backend.connector.plugin;

import org.apache.datawise.backend.domain.ConnectorPluginIntegrityStatus;
import org.apache.datawise.backend.domain.ConnectorPluginManifest;
import org.apache.datawise.backend.domain.ConnectorPluginManifestEntry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectorPluginManifestSupportTest {

    @TempDir
    Path temp;

    @Test
    void parseManifest_readsPluginsAndChannel() {
        ConnectorPluginManifest manifest = ConnectorPluginManifestSupport.parseManifest("""
                {
                  "schemaVersion": 1,
                  "updatedAt": "2026-07-17T00:00:00Z",
                  "channel": "local",
                  "plugins": [
                    {
                      "id": "oracle",
                      "version": "1.0.0",
                      "jar": "oracle.jar",
                      "sha256": "abc",
                      "downloadUrl": "https://example.com/oracle.jar"
                    }
                  ]
                }
                """);
        assertEquals(1, manifest.schemaVersion());
        assertEquals("local", manifest.channel());
        assertEquals(1, manifest.plugins().size());
        ConnectorPluginManifestEntry entry = manifest.plugins().get(0);
        assertEquals("oracle", entry.id());
        assertEquals("1.0.0", entry.version());
        assertEquals("oracle.jar", entry.jar());
        assertEquals("abc", entry.sha256());
        assertEquals("https://example.com/oracle.jar", entry.downloadUrl());
    }

    @Test
    void parseManifest_keepsEntriesWithNestedJdbcDriver() {
        ConnectorPluginManifest manifest = ConnectorPluginManifestSupport.parseManifest("""
                {
                  "schemaVersion": 1,
                  "channel": "local-mock",
                  "connectors": [
                    {
                      "id": "starrocks",
                      "version": "4.1.6",
                      "jar": "datawise-connector-starrocks-4.1.6.jar",
                      "sha256": "aaa",
                      "downloadUrl": "http://127.0.0.1:8765/starrocks.jar"
                    },
                    {
                      "id": "mysql",
                      "version": "4.1.6",
                      "jar": "datawise-connector-mysql-4.1.6.jar",
                      "sha256": "bbb",
                      "downloadUrl": "http://127.0.0.1:8765/mysql.jar",
                      "jdbcDriver": {
                        "maven": "com.mysql:mysql-connector-j:8.4.0",
                        "driverClass": "com.mysql.cj.jdbc.Driver"
                      }
                    }
                  ]
                }
                """);
        assertEquals(2, manifest.plugins().size());
        ConnectorPluginManifestEntry mysql = ConnectorPluginManifestSupport.findById(manifest, "mysql").orElseThrow();
        assertEquals("datawise-connector-mysql-4.1.6.jar", mysql.jar());
        assertEquals("bbb", mysql.sha256());
        assertEquals("http://127.0.0.1:8765/mysql.jar", mysql.downloadUrl());
        assertTrue(ConnectorPluginManifestSupport.findByJar(manifest, "datawise-connector-mysql-4.1.6.jar").isPresent());
    }

    @Test
    void matchesSha256_validatesFileDigest() throws Exception {
        Path jar = temp.resolve("sample.jar");
        Files.writeString(jar, "hello-plugin", StandardCharsets.UTF_8);
        String digest = ConnectorPluginManifestSupport.sha256Hex(jar);
        assertTrue(ConnectorPluginManifestSupport.matchesSha256(jar, digest));
        assertFalse(ConnectorPluginManifestSupport.matchesSha256(jar, "deadbeef"));
    }

    @Test
    void resolveIntegrityStatus_verifiedWhenHashMatches() throws Exception {
        Path jar = temp.resolve("oracle.jar");
        Files.writeString(jar, "oracle-bytes", StandardCharsets.UTF_8);
        String digest = ConnectorPluginManifestSupport.sha256Hex(jar);
        ConnectorPluginManifestEntry entry = new ConnectorPluginManifestEntry(
                "oracle", "1.0.0", "oracle.jar", digest, null);
        String status = ConnectorPluginManifestSupport.resolveIntegrityStatus(
                true,
                true,
                Optional.of(entry),
                temp,
                "oracle.jar");
        assertEquals(ConnectorPluginIntegrityStatus.VERIFIED, status);
    }

    @Test
    void readManifest_prefersRuntimeCatalogDownloadUrls() throws Exception {
        Path plugins = temp.resolve("plugins");
        Files.createDirectories(plugins);
        Files.writeString(plugins.resolve("manifest.json"), """
                {
                  "schemaVersion": 1,
                  "channel": "local",
                  "plugins": [
                    { "id": "mysql", "version": "1.0.0", "jar": "mysql.jar", "sha256": "localhash" }
                  ]
                }
                """, StandardCharsets.UTF_8);
        Files.writeString(temp.resolve("runtime-catalog.json"), """
                {
                  "schemaVersion": 1,
                  "channel": "stable",
                  "connectors": [
                    {
                      "id": "mysql",
                      "version": "4.1.6",
                      "jar": "datawise-connector-mysql-4.1.6.jar",
                      "sha256": "remotehash",
                      "downloadUrl": "https://example.com/connectors/mysql.jar"
                    },
                    {
                      "id": "oracle",
                      "version": "4.1.6",
                      "jar": "datawise-connector-oracle-4.1.6.jar",
                      "downloadUrl": "https://example.com/connectors/oracle.jar"
                    }
                  ]
                }
                """, StandardCharsets.UTF_8);

        Optional<ConnectorPluginManifest> loaded = ConnectorPluginManifestSupport.readManifest(plugins);
        assertTrue(loaded.isPresent());
        ConnectorPluginManifestEntry mysql = ConnectorPluginManifestSupport.findById(loaded.get(), "mysql").orElseThrow();
        assertEquals("https://example.com/connectors/mysql.jar", mysql.downloadUrl());
        assertEquals("remotehash", mysql.sha256());
        assertTrue(ConnectorPluginManifestSupport.findById(loaded.get(), "oracle").isPresent());
    }
}
