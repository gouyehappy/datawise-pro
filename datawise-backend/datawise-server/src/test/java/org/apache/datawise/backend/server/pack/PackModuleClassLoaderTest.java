package org.apache.datawise.backend.server.pack;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackModuleClassLoaderTest {

    @TempDir
    Path temp;

    @Test
    void refreshRegistersBackendJars() throws Exception {
        Path packs = temp.resolve("packs");
        Path backend = packs.resolve("pack.ai").resolve("backend");
        Files.createDirectories(backend);
        Path jar = backend.resolve("sample.jar");
        try (JarOutputStream jos = new JarOutputStream(Files.newOutputStream(jar))) {
            jos.putNextEntry(new JarEntry("META-INF/MANIFEST.MF"));
            jos.write("Manifest-Version: 1.0\n".getBytes());
            jos.closeEntry();
        }
        PackModuleClassLoader loader = new PackModuleClassLoader();
        assertFalse(loader.hasModules());
        loader.refresh(packs);
        assertTrue(loader.hasModules());
        loader.refresh(packs.resolve("missing"));
        assertFalse(loader.hasModules());
    }
}
