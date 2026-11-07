package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.jdbc.connection.JdbcMavenCoordinate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcDriverLoaderTest {

    @Test
    void isMavenCoordinates_acceptsValidTriple() {
        assertTrue(JdbcDriverLoader.isMavenCoordinates("com.mysql:mysql-connector-j:8.4.0"));
        assertTrue(JdbcDriverLoader.isMavenCoordinates("org.postgresql:postgresql:42.7.4"));
    }

    @Test
    void isMavenCoordinates_rejectsInvalidValues() {
        assertFalse(JdbcDriverLoader.isMavenCoordinates(null));
        assertFalse(JdbcDriverLoader.isMavenCoordinates(""));
        assertFalse(JdbcDriverLoader.isMavenCoordinates("mysql-connector-j-8.4.0.jar"));
        assertFalse(JdbcDriverLoader.isMavenCoordinates("com.mysql:mysql-connector-j"));
    }

    @Test
    void normalizeDriverInput_acceptsJarFileName() {
        assertEquals(
                "com.mysql:mysql-connector-java:8.0.30",
                JdbcDriverLoader.normalizeDriverInput("mysql-connector-java-8.0.30.jar")
        );
        assertEquals(
                "com.mysql:mysql-connector-j:8.4.0",
                JdbcDriverLoader.normalizeDriverInput("mysql-connector-j-8.4.0.jar")
        );
        assertEquals(
                "com.dameng:DmJdbcDriver18:8.1.3.140",
                JdbcDriverLoader.normalizeDriverInput("DmJdbcDriver18-8.1.3.140.jar")
        );
    }

    @Test
    void normalizeDriverInput_rejectsUnknownJarFileName() {
        assertThrows(IllegalArgumentException.class,
                () -> JdbcDriverLoader.normalizeDriverInput("unknown-driver-1.0.0.jar"));
    }

    @Test
    void mavenCoordinate_buildsRepositoryPathAndFileName(@TempDir Path configDir) throws Exception {
        new JdbcDriverLoader(configDir.toString());
        JdbcMavenCoordinate coordinate = JdbcMavenCoordinate.parse("com.mysql:mysql-connector-j:8.4.0");

        assertEquals("mysql-connector-j-8.4.0.jar", coordinate.fileName());
        assertEquals(
                "com/mysql/mysql-connector-j/8.4.0/mysql-connector-j-8.4.0.jar",
                coordinate.repositoryPath()
        );
        assertEquals("com.mysql:mysql-connector-j:8.4.0", coordinate.cacheKey());
        assertTrue(configDir.resolve("drivers").toFile().isDirectory());
    }

    @Test
    void mavenCoordinate_parseRejectsInvalidInput() {
        assertThrows(IllegalArgumentException.class,
                () -> JdbcMavenCoordinate.parse("bad-coordinates"));
    }

    @Test
    void resolveLocalJarFileName_usesCompatibleMysqlJar(@TempDir Path configDir) throws Exception {
        Path drivers = configDir.resolve("drivers");
        Files.createDirectories(drivers);
        Files.writeString(drivers.resolve("mysql-connector-j-8.4.0.jar"), "fake");

        JdbcDriverLoader loader = new JdbcDriverLoader(configDir.toString());
        assertEquals(
                "mysql-connector-j-8.4.0.jar",
                loader.resolveLocalJarFileName(
                        "com.mysql:mysql-connector-java:8.0.30",
                        "com.mysql.cj.jdbc.Driver"
                ).orElseThrow()
        );
        assertTrue(loader.hasCachedJar("com.mysql:mysql-connector-java:8.0.30"));
    }

    @Test
    void preloadIfPresent_skipsWhenJarMissing(@TempDir Path configDir) throws Exception {
        JdbcDriverLoader loader = new JdbcDriverLoader(configDir.toString());
        assertTrue(loader.preloadIfPresent("com.mysql:mysql-connector-j:8.4.0", "com.mysql.cj.jdbc.Driver")
                .isEmpty());
    }

    @Test
    void resolveLocalJarFileName_doesNotReuseDifferentElasticsearchVersion(@TempDir Path configDir) throws Exception {
        Path drivers = configDir.resolve("drivers");
        Files.createDirectories(drivers);
        Files.writeString(drivers.resolve("x-pack-sql-jdbc-8.17.5.jar"), "fake");

        JdbcDriverLoader loader = new JdbcDriverLoader(configDir.toString());
        assertTrue(
                loader.resolveLocalJarFileName(
                        "org.elasticsearch.plugin:x-pack-sql-jdbc:7.3.0",
                        null
                ).isEmpty()
        );

        Files.writeString(drivers.resolve("x-pack-sql-jdbc-7.3.0.jar"), "fake");
        assertEquals(
                "x-pack-sql-jdbc-7.3.0.jar",
                loader.resolveLocalJarFileName(
                        "org.elasticsearch.plugin:x-pack-sql-jdbc:7.3.0",
                        null
                ).orElseThrow()
        );
    }

    @Test
    void resolveLocalJarFileName_reusesLocalGbaseWhenVersionDiffers(@TempDir Path configDir) throws Exception {
        Path drivers = configDir.resolve("drivers");
        Files.createDirectories(drivers);
        Files.writeString(drivers.resolve("gbase-connector-java-9.5.0.7-build1-bin.jar"), "fake");

        JdbcDriverLoader loader = new JdbcDriverLoader(configDir.toString());
        assertEquals(
                "gbase-connector-java-9.5.0.7-build1-bin.jar",
                loader.resolveLocalJarFileName(
                        "com.gbase:gbase-connector-java:9.5.0.10",
                        "com.gbase.jdbc.Driver"
                ).orElseThrow()
        );
        assertTrue(loader.hasCachedJar("com.gbase:gbase-connector-java:9.5.0.10"));
    }
}
