package org.apache.datawise.backend.server.runtime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RuntimeOfflineZipSupportTest {

    @TempDir
    Path tempDir;

    @Test
    void extractsPluginsDriversAndCatalog() throws Exception {
        Path zip = tempDir.resolve("runtime.zip");
        try (OutputStream out = Files.newOutputStream(zip);
             ZipOutputStream zos = new ZipOutputStream(out)) {
            put(zos, "plugins/mysql-connector.jar", "plugin-bytes");
            put(zos, "connectors/oracle-connector.jar", "oracle-bytes");
            put(zos, "drivers/mysql-connector-j.jar", "driver-bytes");
            put(zos, "drivers/hive/hive-jdbc.jar", "hive-bytes");
            put(zos, "runtime-catalog.json", "{\"version\":1}");
            put(zos, "README.md", "ignored");
        }

        Path plugins = tempDir.resolve("config/plugins");
        Path drivers = tempDir.resolve("config/drivers");
        Path config = tempDir.resolve("config");

        RuntimeOfflineZipSupport.ExtractResult result =
                RuntimeOfflineZipSupport.extract(zip, plugins, drivers, config);

        assertEquals(2, result.pluginJars().size());
        assertTrue(result.pluginJars().contains("mysql-connector.jar"));
        assertTrue(result.pluginJars().contains("oracle-connector.jar"));
        assertTrue(result.driverJars().contains("mysql-connector-j.jar"));
        assertTrue(result.driverJars().contains("hive/hive-jdbc.jar"));
        assertTrue(result.catalogOverlay());
        assertEquals("plugin-bytes", Files.readString(plugins.resolve("mysql-connector.jar")));
        assertEquals("hive-bytes", Files.readString(drivers.resolve("hive/hive-jdbc.jar")));
        assertEquals("{\"version\":1}", Files.readString(config.resolve("runtime-catalog.json")));
        assertFalse(Files.exists(config.resolve("README.md")));
    }

    @Test
    void rejectsZipSlipEntries() throws Exception {
        Path zip = tempDir.resolve("evil.zip");
        try (OutputStream out = Files.newOutputStream(zip);
             ZipOutputStream zos = new ZipOutputStream(out)) {
            put(zos, "../evil.jar", "nope");
        }

        Path plugins = tempDir.resolve("plugins");
        Path drivers = tempDir.resolve("drivers");
        Path config = tempDir.resolve("config");

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> RuntimeOfflineZipSupport.extract(zip, plugins, drivers, config)
        );
        assertTrue(ex.getMessage().contains("escapes"));
        assertFalse(Files.exists(tempDir.resolve("evil.jar")));
    }

    @Test
    void rejectsAbsoluteZipEntries() throws Exception {
        Path zip = tempDir.resolve("abs.zip");
        try (OutputStream out = Files.newOutputStream(zip);
             ZipOutputStream zos = new ZipOutputStream(out)) {
            put(zos, "/tmp/evil.jar", "nope");
        }

        assertThrows(
                IllegalArgumentException.class,
                () -> RuntimeOfflineZipSupport.extract(
                        zip,
                        tempDir.resolve("plugins"),
                        tempDir.resolve("drivers"),
                        tempDir.resolve("config")
                )
        );
    }

    private static void put(ZipOutputStream zos, String name, String content) throws Exception {
        zos.putNextEntry(new ZipEntry(name));
        zos.write(content.getBytes(StandardCharsets.UTF_8));
        zos.closeEntry();
    }
}
