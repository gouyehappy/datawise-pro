package org.apache.datawise.backend.jdbc.support;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ClassLoaderDriverDataSourceTest {

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
    void hikariPool_initializesWithDynamicallyLoadedMysqlDriver() throws Exception {
        Path configRoot = repoConfigRoot();
        JdbcDriverLoader loader = new JdbcDriverLoader(configRoot.toString());
        JdbcDriverLoader.LoadedDriver loaded = loader.ensureDriver(
                "com.mysql:mysql-connector-j:8.4.0",
                "com.mysql.cj.jdbc.Driver"
        );

        Properties props = new Properties();
        props.setProperty("user", "root");
        props.setProperty("password", "secret");

        HikariConfig config = new HikariConfig();
        config.setPoolName("dw-test");
        config.setMaximumPoolSize(1);
        config.setMinimumIdle(0);
        config.setConnectionTimeout(2_000);
        config.setInitializationFailTimeout(-1);
        config.setDataSource(new ClassLoaderDriverDataSource(
                loaded.driver(),
                "jdbc:mysql://127.0.0.1:3306/test",
                props,
                loaded.classLoader()
        ));

        assertDoesNotThrow(() -> {
            try (HikariDataSource dataSource = new HikariDataSource(config)) {
                assertNotNull(dataSource.getDataSource());
            }
        });
    }
}
