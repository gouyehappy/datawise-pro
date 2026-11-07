package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertNotNull;

class JdbcDriverLoadIntegrationTest {

    private static Path repoConfigRoot() {
        Path moduleDir = Paths.get("").toAbsolutePath().normalize();
        Path candidate = moduleDir.resolve("../../../config").normalize();
        if (Files.isDirectory(candidate.resolve("drivers"))) {
            return candidate;
        }
        return Paths.get("config").toAbsolutePath().normalize();
    }

    private static boolean mysqlJarPresent() {
        return Files.isRegularFile(repoConfigRoot().resolve("drivers/mysql-connector-j-8.4.0.jar"));
    }

    @Test
    @EnabledIf("mysqlJarPresent")
    void ensureDriver_loadsRealMysqlJarFromRepoConfig() throws Exception {
        Path configRoot = repoConfigRoot();
        JdbcDriverLoader loader = new JdbcDriverLoader(configRoot.toString());
        var loaded = loader.ensureDriver("com.mysql:mysql-connector-j:8.4.0", "com.mysql.cj.jdbc.Driver");
        assertNotNull(loaded.driver());
        assertNotNull(loaded.classLoader());
    }
}
